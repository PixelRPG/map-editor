#!/usr/bin/env python3
"""Capture every top-level view of the maker at desktop/tablet/phone sizes.

usage: capture-views.py <checkout> <outdir> [project.json] [--lang CODE] [--only ID,ID]

--lang CODE   run the app with LANGUAGE=CODE, write to <outdir>/<CODE>/<tier>/
--only IDS    capture just these shot ids (file stems, e.g. 07-map-editor)

Drives a dedicated app instance over the org.pixelrpg.maker.Control D-Bus
interface (PIXELRPG_INSTANCE=shots), so it never touches a running editor.
Must run inside a headless session (a nested compositor or Xvfb at 1920x1200
or larger), otherwise the window opens on the real desktop and steals focus:

  mkdir -p /tmp/shots && <headless-wrapper> -- \
      python3 scripts/capture-views.py "$PWD" /tmp/shots
"""
import argparse, ast, json, os, re, subprocess, sys, time

# Shots of the per-tier process (01-11) and of the terrain process (12-14).
TIER_SHOTS = ["01-welcome", "02-world-atlas", "02b-world-selected", "03-library-characters", "04-library-things",
              "05-library-graphics-fullview", "06-game", "06b-game-rules", "07-map-editor",
              "07-map-editor-zoom-0.75", "07-map-editor-zoom-0.3", "07-map-editor-zoom-fit", "07-map-editor-hover-dot",
              "08-map-editor-inspector-toggled", "09-map-editor-fullview", "10-playing", "11-together"]
TERRAIN_SHOTS = ["12-tileset-detail", "13-terrain-dialog", "14-terrain-find"]

ap = argparse.ArgumentParser()
ap.add_argument("checkout")
ap.add_argument("outdir")
ap.add_argument("project", nargs="?")
ap.add_argument("--lang")
ap.add_argument("--only")
args = ap.parse_args()
CO, OUT = args.checkout, args.outdir
ONLY = set(args.only.split(",")) if args.only else None
if ONLY and ONLY - set(TIER_SHOTS + TERRAIN_SHOTS):
    ap.error("unknown shot id(s) %s; valid: %s" % (", ".join(sorted(ONLY - set(TIER_SHOTS + TERRAIN_SHOTS))),
                                                    ", ".join(TIER_SHOTS + TERRAIN_SHOTS)))
if args.lang:
    OUT = os.path.join(OUT, args.lang)
LABEL = "shots"
BIN = os.path.join(CO, "apps/maker-gjs/org.pixelrpg.maker")
PROJECT = args.project or os.path.join(CO, "games/zelda-like/game-project.json")
gip = subprocess.run(["find", os.path.join(CO, "node_modules"), "-type", "d", "-path", "*/prebuilds/linux-x64"],
                     capture_output=True, text=True).stdout.split()
ENV = {**os.environ, "GI_TYPELIB_PATH": ":".join(gip), "LD_LIBRARY_PATH": ":".join(gip), "PIXELRPG_INSTANCE": LABEL,
       **({"LANGUAGE": args.lang} if args.lang else {})}
TIERS = [("desktop", 1280, 800), ("tablet", 768, 1024), ("phone", 400, 880)]


def call(method, *args, timeout=60):
    cmd = ["gdbus", "call", "--session", "--dest", f"org.pixelrpg.maker.{LABEL}",
           "--object-path", f"/org/pixelrpg/maker/{LABEL}/control",
           "--method", f"org.pixelrpg.maker.Control.{method}", *args]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def status():
    r = call("GetStatus", timeout=10)
    try:
        return json.loads(ast.literal_eval(r.stdout.strip())[0])
    except Exception:
        return None


def wait(pred, timeout=60):
    end = time.time() + timeout
    while time.time() < end:
        s = status()
        if s and pred(s):
            return s
        time.sleep(0.5)
    return None


def act(name, value=None, scope="win"):
    mark(f"act {name} {value}")
    v = "" if value is None else json.dumps(json.dumps(value))  # "\"world\"" for gdbus GVariant + app JSON.parse
    r = call("ActivateAction", scope, name, v if v else "''")
    if r.returncode != 0:
        print("ACT FAIL", name, value, r.stderr.strip()[:200])
    time.sleep(1.2)


def mark(msg):
    log.write(f"\n=== {msg}\n")
    log.flush()


def shot(tier, name, scope="window"):
    if ONLY and name not in ONLY:
        return
    mark(f"shot {name}")
    time.sleep(0.8)
    r = subprocess.run(["gdbus", "call", "--session", "--dest", f"org.pixelrpg.maker.{LABEL}",
                        "--object-path", f"/org/pixelrpg/maker/{LABEL}/control",
                        "--method", "org.pixelrpg.maker.Control.Screenshot", scope],
                       capture_output=True, text=True, timeout=60)
    txt = r.stdout.strip()
    try:
        data = bytes(int(x, 16) for x in re.findall(r"0x([0-9a-fA-F]{2})", txt))
        assert data[:4] == b"\x89PNG", txt[:120]
    except Exception as e:
        print("SHOT FAIL", tier, name, e, txt[:200], r.stderr[:200])
        return
    os.makedirs(os.path.join(OUT, tier), exist_ok=True)
    path = os.path.join(OUT, tier, f"{name}.png")
    with open(path, "wb") as f:
        f.write(data)
    print("ok", path, len(data))


os.makedirs(OUT, exist_ok=True)
log = open(os.path.join(OUT, "app.log"), "w")


def capture_terrain(tier, w, h):
    # Own process: the ground-brush dialog is modal and no Control action
    # dismisses it, same as Together.
    p = subprocess.Popen([BIN], env=ENV, stdout=log, stderr=log)
    try:
        if not wait(lambda s: s.get("mapped"), 90):
            sys.exit("app never came up")
        call("ResizeWindow", str(w), str(h))
        time.sleep(1.5)
        call("OpenProject", PROJECT)
        wait(lambda s: len(s.get("sceneIds", [])) > 0, 60)
        time.sleep(2)
        act("mode", "library")
        act("library-chip", "graphics")
        act("open-tileset", "kokiri-forest")
        time.sleep(1)
        shot(tier, "12-tileset-detail")
        act("edit-terrains", "")
        time.sleep(1)
        shot(tier, "13-terrain-dialog")
        act("edit-terrains", "find")
        time.sleep(1.5)
        shot(tier, "14-terrain-find")
    finally:
        p.terminate()
        try:
            p.wait(10)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait()


def capture_tier(tier, w, h):
    # One app process per tier: the Together dialog (last shot) has no
    # Control action to dismiss it, so the next tier starts from a fresh
    # window instead of fighting a modal dialog.
    p = subprocess.Popen([BIN], env=ENV, stdout=log, stderr=log)
    try:
        if not wait(lambda s: s.get("mapped"), 90):
            sys.exit("app never came up")
        call("ResizeWindow", str(w), str(h))
        time.sleep(1.5)
        shot(tier, "01-welcome")
        call("OpenProject", PROJECT)
        s = wait(lambda s: len(s.get("sceneIds", [])) > 0, 60)
        time.sleep(2)
        act("mode", "world")
        act("atlas-fit")
        shot(tier, "02-world-atlas")
        act("select-scene", s["sceneIds"][0])
        act("dismiss-toasts")  # the assistant cue would cover the pill
        shot(tier, "02b-world-selected")
        act("mode", "library")
        for i, chip in enumerate(["characters", "things"]):
            act("library-chip", chip)
            shot(tier, f"0{3 + i}-library-{chip}")
        act("full-view", None, scope="app")
        act("library-chip", "graphics")
        shot(tier, "05-library-graphics-fullview")
        act("full-view", None, scope="app")
        act("mode", "game")
        shot(tier, "06-game")
        act("game-section", "rules")  # phone: drills into the section
        shot(tier, "06b-game-rules")
        act("back")  # phone: pops it again
        scene = next((i for i in s["sceneIds"] if "kokiri" in i), s["sceneIds"][0])
        act("open-scene-by-id", scene)
        wait(lambda s: s.get("engineReady") and s.get("activeLayer"), 60)
        time.sleep(3)
        shot(tier, "07-map-editor")
        if tier == "desktop":  # the baked-chunk levels of detail (below zoom 1)
            for z in ("0.75", "0.3", "1"):
                call("SetZoom", z, timeout=15)
                time.sleep(8)
                if z != "1":
                    shot(tier, f"07-map-editor-zoom-{z}")
            call("SetZoom", "1", timeout=15)
            time.sleep(2)
        # Fully zoomed out: ask far below any limit; the engine stops at
        # the whole map and placements draw as dots. Wait until the zoom
        # has settled (two equal readings) instead of a fixed sleep.
        call("SetZoom", "0.01", timeout=15)
        def settled(s, _l=[None]):
            z, prev = s.get("zoom"), _l[0]
            _l[0] = z
            return z is not None and prev is not None and abs(z - prev) < 1e-6
        wait(settled, 20)
        # Canvas scope reads the framebuffer in the next render signal, so the
        # picture is the frame drawn at the settled zoom (a window snapshot of
        # a GL area can return an older frame).
        shot(tier, "07-map-editor-zoom-fit", scope="canvas")
        # A hovered tile at this zoom is a dot, not a frame. HoverTile moves the
        # pointer through the real path; the canvas scope renders the next frame.
        call("HoverTile", "88", "74", timeout=15)
        shot(tier, "07-map-editor-hover-dot", scope="canvas")
        call("SetZoom", "1", timeout=15)
        time.sleep(2)
        act("toggle-inspector")
        shot(tier, "08-map-editor-inspector-toggled")
        act("toggle-inspector")
        act("full-view", None, scope="app")
        shot(tier, "09-map-editor-fullview")
        act("full-view", None, scope="app")
        act("play")
        wait(lambda s: s.get("isPlaying"), 20)
        time.sleep(3)
        shot(tier, "10-playing")
        act("play")
        time.sleep(1)
        act("back-to-atlas")
        # Together (Phase 8.1), solo: one row (you) and the Invite group.
        # Last, because nothing dismisses the dialog over Control. Peer
        # places / Follow (8.2) and the join dialog need a second peer or
        # a pointer press on the welcome view, so they have no solo driver.
        act("mode", "world")
        act("share-session")
        shot(tier, "11-together")
    finally:
        p.terminate()
        try:
            p.wait(10)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait()


for tier, w, h in TIERS:
    if not ONLY or ONLY & set(TIER_SHOTS):
        capture_tier(tier, w, h)
    if not ONLY or ONLY & set(TERRAIN_SHOTS):
        capture_terrain(tier, w, h)
