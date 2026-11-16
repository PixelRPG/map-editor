#!/usr/bin/env python3
"""Measure the map editor's frame pacing, scenario by scenario.

usage: headless-run --size 1920x1200 -- python3 scripts/bench/frame-bench.py <checkout> [scenario ...]

Scenarios (all of them when none are named):
  idle    a loaded map, nothing touched            — the floor
  pan     a 60-step left-button drag across the map
  zoom    20 `win.zoom-in` / `zoom-out` activations
  paint   a 40-tile stroke through PaintTile
  run     Live Run (`win.play`) with the hero walking (held arrow key)
  atlas   the World page — NOT an Excalibur canvas (GTK ScrolledWindow +
          Fixed), so it has no frames to sample; it is here to record
          exactly that, and to show the editor's engine keeps rendering
          after `back-to-atlas` if it ever does

Why pacing and not FPS: an average hides the defect. 16.7 ms every frame
looks smooth; 8 ms then 25 ms averages the same and looks like stutter.
So each scenario reports the spread (p50/p95/p99/max) of the clock's
elapsed time, the share of frames outside ±25 % of the scenario's own
median, and how the budget splits across Excalibur's update, Excalibur's
draw, and the `gap` that is neither (the GLArea render signal, GTK
relayout, GJS GC — everything on the main loop that is not the engine).

Reads the JSON-line stream the in-app probe
(`packages/gjs/src/widgets/engine/frame-probe.ts`,
`PIXELRPG_FRAME_PROBE=<file>`) appends, and slices it by its own
wall-clock timestamps — the app never learns what is being measured.

Prints a Markdown table on stdout and writes the raw records next to it
so a result can be re-reduced without re-running the app.
"""
from __future__ import annotations

import ast
import json
import os
import statistics
import subprocess
import sys
import time

CHECKOUT = os.path.abspath(sys.argv[1])
WANTED = sys.argv[2:]

RIG = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(RIG, "out")
os.makedirs(OUT, exist_ok=True)

BIN = os.path.join(CHECKOUT, "apps/maker-gjs/org.pixelrpg.maker")
PROJECT = os.path.join(CHECKOUT, "games/zelda-like/game-project.json")
MAP = "kokiri-forest"
PROBE = os.path.join(OUT, "frames.jsonl")
LABEL = f"b{os.getpid():x}"

ALL = ["idle", "pan", "zoom", "paint", "run", "atlas"]
SCENARIOS = WANTED or ALL

# Same typelib discovery as scripts/smoke/drive.py — the app needs the
# prebuilt GI modules on its path or it dies before the bus name appears.
gip = subprocess.run(
    ["find", os.path.join(CHECKOUT, "node_modules"), "-type", "d",
     "-path", "*/prebuilds/linux-x64"],
    capture_output=True, text=True, check=True,
).stdout.split()
ENV = {
    **os.environ,
    "GI_TYPELIB_PATH": ":".join(gip),
    "LD_LIBRARY_PATH": ":".join(gip),
    "PIXELRPG_INSTANCE": LABEL,
    "PIXELRPG_FRAME_PROBE": PROBE,
}
if not os.environ.get("WAYLAND_DISPLAY"):
    ENV["XDG_RUNTIME_DIR"] = "/run/user/1000"
    ENV["WAYLAND_DISPLAY"] = "pixrace"
ENV.pop("DISPLAY", None)


def call(method: str, *args: str, timeout: int = 30):
    cmd = ["gdbus", "call", "--session",
           "--dest", f"org.pixelrpg.maker.{LABEL}",
           "--object-path", f"/org/pixelrpg/maker/{LABEL}/control",
           "--method", f"org.pixelrpg.maker.Control.{method}", *args]
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None


def status():
    r = call("GetStatus", timeout=20)
    if r is None or r.returncode != 0:
        return None
    try:
        # literal_eval, not a regex: gdbus prints a GVariant tuple whose
        # string member is python-quoted, and grepping it loses the
        # escaping (scripts/smoke/README.md).
        return json.loads(ast.literal_eval(r.stdout.strip())[0])
    except Exception:
        return None


def activate(name: str, value=None):
    if value is None:
        call("ActivateAction", "win", name, "")
        return
    payload = json.dumps(value).replace('"', '\\"')
    call("ActivateAction", "win", name, f'"{payload}"')


def change_state(name: str, value):
    payload = json.dumps(value).replace('"', '\\"')
    call("ChangeActionState", "win", name, f'"{payload}"')


def must_wait_for(pred, what: str, timeout=45.0):
    deadline = time.time() + timeout
    st = None
    while time.time() < deadline:
        st = status()
        if st is not None and pred(st):
            return st
        time.sleep(0.1)
    raise RuntimeError(f"timed out after {timeout:g}s waiting for {what} (last: {st})")


def gjs(script: str, *args: str) -> None:
    # Never swallow a helper's failure. An input helper that dies on start
    # returns in ~100 ms, the scenario window closes with it, and the table
    # then shows three fast frames where a three-second drag should be —
    # which reads as "the app stalled" when nothing was ever driven.
    started = time.time()
    r = subprocess.run(["gjs", "-m", os.path.join(RIG, script), *map(str, args)],
                       env=ENV, capture_output=True, text=True, timeout=180)
    took = time.time() - started
    if r.returncode != 0:
        raise RuntimeError(f"{script} failed after {took:.2f}s (rc={r.returncode}): "
                           f"{r.stderr.strip()[-400:]}")
    print(f"  [{script} ran {took:.2f}s]", file=sys.stderr)


# ---------------------------------------------------------------- scenarios

SETTLE_S = 1.5   # let the previous scenario's work drain out of the stream
SAMPLE_S = 6.0   # idle / run observation window


def scenario_idle():
    time.sleep(SAMPLE_S)


def scenario_pan():
    # 200 motions at 16 ms ≈ 3.3 s of continuous dragging. A one-second drag
    # was too short to measure: panning is the slowest scenario, so the few
    # frames it does produce have to come from a window long enough that a
    # single stall cannot be the whole sample.
    gjs("pointer-drag.js", 200, -8, -4, 16)


def scenario_zoom():
    for i in range(20):
        activate("zoom-in" if i % 4 < 2 else "zoom-out")
        time.sleep(0.12)


def scenario_paint():
    # A stroke, not a single tap: the per-tile command path (op-log entry,
    # tilemap invalidation, collision refresh) is what a brush stroke
    # really costs, and one tile cannot show whether it accumulates.
    for i in range(40):
        call("PaintTile", "", str(6 + i % 20), str(6 + i // 20), "-1", timeout=15)
        time.sleep(0.05)


def scenario_run():
    change_state("play", True)
    must_wait_for(lambda s: s.get("isPlaying") is True, "Live Run to start", 30)
    # Hold Right so the hero actually walks — a standing hero measures the
    # idle path again, and the walk is what adds actor updates, the
    # follow camera and the collision queries to the frame.
    gjs("hold-key.js", 0xff53, int(SAMPLE_S * 2000))
    change_state("play", False)


def scenario_atlas():
    activate("back-to-atlas")
    must_wait_for(lambda s: s.get("view") == "world", "the World page", 20)
    time.sleep(SAMPLE_S * 2)
    activate("open-scene-by-id", MAP)
    must_wait_for(lambda s: s.get("engineReady") is True and s.get("currentSceneId") == MAP,
                  "the map again", 45)


RUNNERS = {
    "idle": scenario_idle,
    "pan": scenario_pan,
    "zoom": scenario_zoom,
    "paint": scenario_paint,
    "run": scenario_run,
    "atlas": scenario_atlas,
}


# ---------------------------------------------------------------- reduction

def pct(values: list[float], p: float) -> float:
    if not values:
        return float("nan")
    ordered = sorted(values)
    k = min(len(ordered) - 1, max(0, int(round(p / 100 * (len(ordered) - 1)))))
    return ordered[k]


def reduce_window(records: list[dict]) -> dict:
    el = [r["el"] for r in records]
    if not el:
        return {"frames": 0}
    median = statistics.median(el)
    # "Dropped" has no meaning without a target refresh rate, and under
    # headless mutter there is no physical one. So report two things that
    # survive that: frames whose elapsed exceeds 2× the scenario's own
    # median (a visible hitch), and the share outside ±25 % of it (the
    # judder a steady hand still feels).
    hitches = sum(1 for v in el if v > 2 * median)
    unsteady = sum(1 for v in el if abs(v - median) > 0.25 * median)
    gaps = [r["gap"] for r in records]
    return {
        "frames": len(el),
        "fps": round(1000 / statistics.mean(el), 1) if statistics.mean(el) else 0,
        "mean": round(statistics.mean(el), 2),
        "p50": round(median, 2),
        "p95": round(pct(el, 95), 2),
        "p99": round(pct(el, 99), 2),
        "max": round(max(el), 2),
        "hitch_pct": round(100 * hitches / len(el), 1),
        "unsteady_pct": round(100 * unsteady / len(el), 1),
        "update": round(statistics.mean(r["u"] for r in records), 2),
        "draw": round(statistics.mean(r["d"] for r in records), 2),
        "gap_mean": round(statistics.mean(gaps), 2),
        "gap_p95": round(pct(gaps, 95), 2),
        "colliders": round(statistics.mean(r.get("cc", 0) for r in records), 1),
        "alive": round(statistics.mean(r["alive"] for r in records), 1),
        "raf_mean": round(statistics.mean(r["raf"] for r in records), 2),
        "draw_calls": round(statistics.mean(r["dc"] for r in records), 1),
        "images": round(statistics.mean(r["di"] for r in records), 1),
    }


def read_probe() -> list[dict]:
    if not os.path.exists(PROBE):
        return []
    out = []
    with open(PROBE, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    pass  # a partially flushed tail line
    return out


def hot_systems(records: list[dict], top: int = 4) -> str:
    totals: dict[str, list[float]] = {}
    for record in records:
        for name, value in (record.get("sys") or {}).items():
            totals.setdefault(name, []).append(value)
    if not totals:
        return "—"
    ranked = sorted(((statistics.mean(v), k) for k, v in totals.items()), reverse=True)
    return ", ".join(f"{k} {v:.2f}" for v, k in ranked[:top])


# ---------------------------------------------------------------- main

open(PROBE, "w").close()
log_path = os.path.join(OUT, "app.log")
log = open(log_path, "wb")
proc = subprocess.Popen([BIN], env=ENV, stdout=log, stderr=subprocess.STDOUT,
                        start_new_session=True)

windows: list[tuple[str, float, float]] = []
try:
    must_wait_for(lambda s: True, "the Control interface", 60)
    call("PresentWindow")
    call("OpenProject", PROJECT, timeout=60)
    must_wait_for(lambda s: MAP in s.get("sceneIds", []), "the project to load", 60)
    activate("open-scene-by-id", MAP)
    must_wait_for(
        lambda s: s.get("engineReady") is True
        and s.get("currentSceneId") == MAP
        and s.get("activeLayer"),
        "a settled map",
        60,
    )
    # The first seconds after a map load are the load itself (texture
    # uploads, tilemap build). Measuring them as "idle" would blame the
    # steady state for one-off work.
    time.sleep(4)

    for name in SCENARIOS:
        time.sleep(SETTLE_S)
        started = time.time()
        RUNNERS[name]()
        windows.append((name, started, time.time()))
finally:
    status_final = status()
    proc.terminate()
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        proc.kill()
    log.close()

records = read_probe()
print(f"\n{len(records)} frames sampled · app log {log_path} · raw {PROBE}\n")
print("| scenario | frames | mean | p50 | p95 | p99 | max | hitch>2× | ±25% | upd | draw | gap | gap p95 | rAF/f | calls | colliders |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
summary: dict[str, dict] = {}
for name, start, end in windows:
    window = [r for r in records if start * 1000 <= r["t"] <= end * 1000]
    stats = reduce_window(window)
    summary[name] = {**stats, "systems": hot_systems(window)}
    if not stats["frames"]:
        print(f"| {name} | 0 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |")
        continue
    s = stats
    print(f"| {name} | {s['frames']} | {s['mean']} | {s['p50']} | {s['p95']} | {s['p99']} | "
          f"{s['max']} | {s['hitch_pct']}% | {s['unsteady_pct']}% | {s['update']} | {s['draw']} | "
          f"{s['gap_mean']} | {s['gap_p95']} | {s['raf_mean']} | {s['draw_calls']} | {s['colliders']} |")

print("\nhot ECS systems (mean ms, one frame in 60 sampled):")
for name in summary:
    print(f"  {name}: {summary[name]['systems']}")

with open(os.path.join(OUT, "summary.json"), "w", encoding="utf-8") as fh:
    json.dump({"windows": summary, "final_status": status_final}, fh, indent=2)
print(f"\nsummary → {os.path.join(OUT, 'summary.json')}")
