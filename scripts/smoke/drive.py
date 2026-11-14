#!/usr/bin/env python3
"""Drive the PixelRPG maker over its Control D-Bus interface and report
whether the editor ends up with a live engine.

usage: drive.py <checkout> <runs> <tag> <scenario>

scenarios
  single    open project, open the startup map                (baseline)
  double    open the same map twice back to back              (double-click)
  switch    open map A, immediately open map B
  reopen    open project + map, then open the project AGAIN + map
            (the "same session, second time" the bug report describes)
  handoff   open map A, then open map B the instant the engine reports
            itself live — lands the second open INSIDE the project load,
            which is the window the two collide in
  churn     open project + map, then switch maps 4x fast
  enterleave  open a map, go back to the World page, repeat 8x — each
              round trip destroys and rebuilds the engine widget + its GL
              context, and is checked to leave SceneEditorView rooted
  back      deep-link onto a placement, then press `win.back` twice and
            check it undoes ONE thing per press, in the order § 3.4 fixes

A run PASSES when, after the last step, GetStatus reports
engineReady=true AND currentSceneId is the map we asked for AND
activeLayer is non-null (a live engine on the right scene, with the
editor state actually planted on it).

Every scenario also asserts `rosterChipViews == 4` once the engine check
passed: all four destinations must have built a header/pill roster chip
(REDESIGN.md § 3.3). A solo roster hides the chip, so nothing else in
this run — or in a screenshot — can tell a missing chip from an empty
one.

`back` is the one scenario that asserts an ORDER rather than an end
state. Back is one decision behind five gestures (REDESIGN.md § 3.4), so
the failure it looks for is a press that undoes two things at once: with
a placement selected, the first back must clear the selection and LEAVE
the editor open, and only the second may fall back to World. A resolver
that checked the steps in the wrong order still ends up on World, which
every other check here would score as a pass.

`enterleave` additionally asserts `sceneEditorRooted` on BOTH sides of
every switch. The editor's two stacks only change which page is visible,
so SceneEditorView must stay parented by `root_stack` for the process's
lifetime: the gjs Engine tears Excalibur down in `vfunc_unroot` and
nothing rebuilds it, so one stray unroot kills the map editor for good
(REDESIGN.md § 10, risk 4). `engineReady` alone would not catch it — it
reports the CURRENT entry, and the teardown is only visible on the next.
"""
from __future__ import annotations

import ast
import json
import os
import shutil
import signal
import subprocess
import sys
import time

CHECKOUT = sys.argv[1]
RUNS = int(sys.argv[2])
TAG = sys.argv[3]
SCENARIO = sys.argv[4]

RIG = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(RIG, f"out-{TAG}")
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT, exist_ok=True)

BIN = os.path.join(CHECKOUT, "apps/maker-gjs/org.pixelrpg.maker")
PROJECT = os.path.join(CHECKOUT, "games/zelda-like/game-project.json")
MAP_A = "kokiri-forest"
MAP_B = "tree-house"

gip = subprocess.run(
    ["find", os.path.join(CHECKOUT, "node_modules"), "-type", "d",
     "-path", "*/prebuilds/linux-x64"],
    capture_output=True, text=True, check=True,
).stdout.split()
ENV = {
    **os.environ,
    "GI_TYPELIB_PATH": ":".join(gip),
    "LD_LIBRARY_PATH": ":".join(gip),
}
# The rig's own long-lived compositor, unless we were started inside one
# already (`headless-run` exports its private socket) — overriding that
# would point the app at a display that is not there.
if not os.environ.get("WAYLAND_DISPLAY"):
    ENV["XDG_RUNTIME_DIR"] = "/run/user/1000"
    ENV["WAYLAND_DISPLAY"] = "pixrace"
ENV.pop("DISPLAY", None)


def call(label: str, method: str, *args: str, timeout: int = 30):
    cmd = ["gdbus", "call", "--session",
           "--dest", f"org.pixelrpg.maker.{label}",
           "--object-path", f"/org/pixelrpg/maker/{label}/control",
           "--method", f"org.pixelrpg.maker.Control.{method}", *args]
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None


def status(label: str):
    r = call(label, "GetStatus", timeout=20)
    if r is None or r.returncode != 0:
        return None
    try:
        return json.loads(ast.literal_eval(r.stdout.strip())[0])
    except Exception:
        return None


def activate(label: str, name: str):
    call(label, "ActivateAction", "win", name, "")


def activate_value(label: str, name: str, value):
    # Two unwrapping layers, same as open_scene_argv: gdbus parses the
    # argument as a GVariant string (so the JSON has to arrive quoted and
    # inner-escaped), and the app JSON.parses what is left. A tuple
    # parameter like `win.focus-placement`'s `(ss)` takes a JSON ARRAY.
    #
    # Unlike `activate`, this one RAISES on a rejected call. A parameter
    # is exactly what the marshaller can get wrong (wrong arity, a kind
    # it cannot build), and GTK answers a type mismatch with a warning on
    # a stderr nobody reads — the deep link would just not happen, and
    # the scenario would blame whatever it asserted next.
    payload = json.dumps(value).replace('"', '\\"')
    r = call(label, "ActivateAction", "win", name, f'"{payload}"')
    if r is None:
        raise RuntimeError(f"activate-timeout:win.{name}")
    if r.returncode != 0:
        raise RuntimeError(f"activate-failed:win.{name}: {r.stderr.strip() or r.stdout.strip()}")


def map_data(label: str, map_id: str) -> dict:
    r = call(label, "GetMapData", map_id, timeout=20)
    if r is None or r.returncode != 0:
        raise RuntimeError(f"no-map-data:{map_id}")
    return json.loads(ast.literal_eval(r.stdout.strip())[0])


def first_placement_id(label: str, map_id: str) -> str:
    """A placement id to deep-link onto, read from the app, not the file.

    `win.focus-placement` is reached over the same Control plane as every
    other deep link, so the id it is given has to be one the app itself
    reports — a map whose placements failed to load would otherwise be
    deep-linked with an id out of a JSON file and look fine.
    """
    placements = map_data(label, map_id).get("placements") or []
    ids = [p.get("id") for p in placements if p.get("id")]
    if not ids:
        raise RuntimeError(f"no-placements:{map_id}")
    return ids[0]


def open_scene_argv(label: str, scene: str) -> list[str]:
    # gdbus GVariant-unquotes each argument before the app sees it, and
    # the app JSON.parses what is left — both layers or it silently no-ops.
    return ["gdbus", "call", "--session",
            "--dest", f"org.pixelrpg.maker.{label}",
            "--object-path", f"/org/pixelrpg/maker/{label}/control",
            "--method", "org.pixelrpg.maker.Control.ActivateAction",
            "win", "open-scene-by-id", f'"\\"{scene}\\""']


def open_scene(label: str, scene: str):
    subprocess.run(open_scene_argv(label, scene), capture_output=True, text=True, timeout=30)


def open_scenes_together(label: str, *scenes: str) -> float:
    """Fire several scene opens back to back and return the spread in seconds.

    Spawning `gdbus` and WAITING for it between activations is what a
    naive harness does, and on a loaded machine that gap grows past the
    project load it is supposed to land inside — the race window closes
    and every run comes back green while the defect is untouched. Start
    the processes first, collect them after, and report the spread so a
    run that missed the window is visible instead of silently passing.

    Only safe when every `scenes` entry is the SAME map: the activations
    travel on separate D-Bus connections, so their delivery order is not
    guaranteed.
    """
    started = time.time()
    procs = [subprocess.Popen(open_scene_argv(label, scene),
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
             for scene in scenes]
    spread = time.time() - started
    for proc in procs:
        proc.wait(timeout=30)
    return spread


def wait_for(label: str, pred, timeout=30.0):
    """Poll GetStatus until `pred` holds. On timeout returns the LAST
    status read, not None — callers that only want a best-effort nudge
    rely on that. Use `must_wait_for` when the condition is the assertion.
    """
    deadline = time.time() + timeout
    st = None
    while time.time() < deadline:
        st = status(label)
        if st is not None and pred(st):
            return st
        time.sleep(0.1)
    return st


def must_wait_for(label: str, pred, what: str, timeout=30.0):
    """Like `wait_for`, but a timeout is a failure.

    `wait_for` answering with the last status is a trap for a loop that
    checks something else afterwards: the engine-rebuild regression this
    scenario exists for passed eight rounds of `sceneEditorRooted`
    while `engineReady` was never once true, because every round read a
    stale status instead of stopping. A condition worth waiting for is a
    condition worth failing on.
    """
    deadline = time.time() + timeout
    st = None
    while time.time() < deadline:
        st = status(label)
        if st is not None and pred(st):
            return st
        time.sleep(0.1)
    raise RuntimeError(f"timed out after {timeout:g}s waiting for {what} (last status: {st})")


def require_rooted(st: dict | None, where: str) -> None:
    """Fail the run unless SceneEditorView is still where it was built.

    Read from GetStatus rather than inferred: `sceneEditorRooted` is the
    window comparing the live widget's parent against `root_stack` and its
    root against itself. A missing key is a failure too — the field going
    away would otherwise turn this assertion into a silent pass.
    """
    if st is None:
        raise RuntimeError(f"no status to check sceneEditorRooted ({where})")
    if "sceneEditorRooted" not in st:
        raise RuntimeError(f"GetStatus has no sceneEditorRooted field ({where})")
    if st["sceneEditorRooted"] is not True:
        raise RuntimeError(
            f"SceneEditorView was reparented or unrooted ({where}) — "
            "the Excalibur loop is torn down in vfunc_unroot and never rebuilt"
        )


ROSTER_CHIP_VIEWS = 4


def require_roster_chips(st: dict | None, where: str) -> None:
    """Fail the run unless all four destinations built a roster chip.

    The chip hides itself on an empty roster, so a solo session — which
    is every screenshot and every smoke run — renders identically whether
    a view has a chip or not. That is how World, Library and Game lost
    theirs. `rosterChipViews` is the window counting the chips its widget
    tree actually resolved, so the regression fails here instead of at
    the moment a second participant joins.
    """
    if st is None:
        raise RuntimeError(f"no status to check rosterChipViews ({where})")
    if "rosterChipViews" not in st:
        raise RuntimeError(f"GetStatus has no rosterChipViews field ({where})")
    if st["rosterChipViews"] != ROSTER_CHIP_VIEWS:
        raise RuntimeError(
            f"only {st['rosterChipViews']} of {ROSTER_CHIP_VIEWS} views have a roster "
            f"chip ({where}) — a shell view's template or InternalChildren lost it, "
            "and a solo session cannot show it"
        )


# Per-batch label prefix. It has to be unique across batches, not just
# within one: PIXELRPG_INSTANCE becomes the GApplication id, so if any
# instance from an earlier batch is still alive under the same label the
# new process registers as a REMOTE, activates the old window and exits 0
# — one line of output, no Control interface, and the run scores as a
# failure that never ran. Seen for real; do not simplify this back to a
# bare counter.
LABEL_PREFIX = f"d{os.getpid():x}"


# Spread (seconds) between the paired activations of each run. A run
# whose spread exceeds the project load it had to land inside did not
# exercise the race at all — the summary prints the max so a green batch
# can be told apart from a batch that never tested anything.
spreads: list[float] = []


def run_once(i: int) -> tuple[bool, dict | None, str]:
    label = f"{LABEL_PREFIX}x{i}"
    log_path = os.path.join(OUT, f"run-{i}.log")
    log = open(log_path, "wb")
    proc = subprocess.Popen([BIN], env={**ENV, "PIXELRPG_INSTANCE": label},
                            stdout=log, stderr=subprocess.STDOUT,
                            start_new_session=True)
    try:
        if wait_for(label, lambda s: True, 45) is None:
            # Distinguish "the app died" from "the app is up but mute":
            # the first is an environment problem (no display, a stale
            # instance stealing the name), the second is a real defect.
            return False, None, "app-exited" if proc.poll() is not None else "no-bus"

        want = MAP_A

        def open_project():
            call(label, "OpenProject", PROJECT)
            if wait_for(label, lambda s: MAP_A in s.get("sceneIds", []), 45) is None:
                raise RuntimeError("no-project")

        open_project()

        if SCENARIO == "single":
            open_scene(label, MAP_A)
        elif SCENARIO == "double":
            spreads.append(open_scenes_together(label, MAP_A, MAP_A))
        elif SCENARIO == "switch":
            # Sequential on purpose: two activations fired at once travel
            # on separate D-Bus connections and can be DELIVERED out of
            # order, so "which map won" would be a coin toss rather than
            # a result. `double` can fire together because both opens
            # name the same map.
            open_scene(label, MAP_A)
            open_scene(label, MAP_B)
            want = MAP_B
        elif SCENARIO == "handoff":
            # Firing both opens at once puts the second one BEFORE the
            # canvas is ready, which is a different (and survivable)
            # interleaving. The damaging window opens when the engine
            # reports itself live and closes when the project load
            # finishes, so wait for exactly that edge — what an impatient
            # click on a second atlas card does.
            open_scene(label, MAP_A)
            wait_for(label, lambda s: s.get("engineReady") is True, 40)
            open_scene(label, MAP_B)
            want = MAP_B
        elif SCENARIO == "reopen":
            open_scene(label, MAP_A)
            wait_for(label, lambda s: s.get("engineReady") is True, 30)
            open_project()
            open_scene(label, MAP_A)
        elif SCENARIO == "enterleave":
            for _n in range(8):
                open_scene(label, MAP_A)
                st = must_wait_for(label, lambda s: s.get("engineReady") is True,
                                   f"a live engine (round {_n})", 30)
                require_rooted(st, f"round {_n}, on the map")
                activate(label, "back-to-atlas")
                st = must_wait_for(label, lambda s: s.get("view") == "world",
                                   f"the World page (round {_n})", 15)
                require_rooted(st, f"round {_n}, back on World")
            open_scene(label, MAP_A)
        elif SCENARIO == "back":
            open_scene(label, MAP_A)
            # The settled triple, not just `engineReady`: that flag only
            # says Excalibur exists, and a selection written while the
            # map is still loading lands on the scene that load is about
            # to replace — the selection then vanishes with no warning
            # anywhere. `activeLayer` is what says the layers are live.
            st = must_wait_for(
                label,
                lambda s: s.get("engineReady") is True
                and s.get("currentSceneId") == MAP_A
                and s.get("activeLayer"),
                "a settled map before the back order",
                30,
            )
            require_rooted(st, "on the map, before the first back")

            placement = first_placement_id(label, MAP_A)
            activate_value(label, "focus-placement", [MAP_A, placement])
            must_wait_for(label, lambda s: s.get("selectedPlacements") == [placement],
                          f"the deep link to select {placement}", 20)

            # Step 3 beats step 5: one press, one thing undone. If the
            # resolver reached `leave-map` first the view would be World
            # here, and the next wait would be the one that passed.
            activate(label, "back")
            st = must_wait_for(
                label,
                lambda s: s.get("selectedPlacements") == [] and s.get("view") == "map",
                "the first back to clear the selection and stay on the map",
                15,
            )
            require_rooted(st, "on the map, after the selection back")

            activate(label, "back")
            st = must_wait_for(label, lambda s: s.get("view") == "world",
                               "the second back to reach World", 15)
            require_rooted(st, "back on World")

            # Nothing left to undo: back must now be inert rather than
            # walking further out of the app.
            activate(label, "back")
            time.sleep(0.5)
            st = status(label)
            if st is None or st.get("view") != "world":
                raise RuntimeError(f"a back with nothing to undo left World (view={st and st.get('view')})")

            open_scene(label, MAP_A)
        elif SCENARIO == "churn":
            open_scene(label, MAP_A)
            wait_for(label, lambda s: s.get("engineReady") is True, 30)
            for scene in (MAP_B, MAP_A, MAP_B, MAP_A):
                open_scene(label, scene)
                time.sleep(0.3)
        else:
            raise SystemExit(f"unknown scenario {SCENARIO}")

        st = wait_for(
            label,
            lambda s: s.get("engineReady") is True
            and s.get("currentSceneId") == want
            and s.get("activeLayer"),
            35,
        )
        time.sleep(3)
        st = status(label)
        good = bool(
            st
            and st.get("engineReady") is True
            and st.get("currentSceneId") == want
            and st.get("activeLayer")
        )
        # Only once the engine check passed, so a broken engine still
        # reports as a broken engine rather than as a roster regression.
        if good:
            require_roster_chips(st, "after the last step")
        return good, st, want
    except RuntimeError as exc:
        return False, None, str(exc)
    finally:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
        log.close()


ok = 0
fail = 0
lines = []
for i in range(1, RUNS + 1):
    good, st, want = run_once(i)
    if good:
        ok += 1
        line = f"run {i}: OK"
        os.remove(os.path.join(OUT, f"run-{i}.log"))
    else:
        fail += 1
        detail = "no status" if st is None else (
            f"engineReady={st.get('engineReady')} "
            f"enginePresent={st.get('enginePresent')} "
            f"currentSceneId={st.get('currentSceneId')} "
            f"activeLayer={st.get('activeLayer')} view={st.get('view')}"
        )
        line = f"run {i}: FAIL want={want} {detail}"
        with open(os.path.join(OUT, f"status-fail-{i}.json"), "w") as fh:
            json.dump(st, fh, indent=2)
    print(line, flush=True)
    lines.append(line)
    time.sleep(0.5)

spread_note = f" max activation spread {max(spreads) * 1000:.0f} ms" if spreads else ""
summary = f"=== {TAG}/{SCENARIO}: ok={ok} fail={fail} / {RUNS}{spread_note} ==="
print(summary, flush=True)
with open(os.path.join(OUT, "result.txt"), "w") as fh:
    fh.write("\n".join([*lines, summary]) + "\n")
