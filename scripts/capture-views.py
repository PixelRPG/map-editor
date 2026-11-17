#!/usr/bin/env python3
"""Capture every top-level view of the maker at desktop/tablet/phone sizes.

usage: capture-views.py <checkout> <outdir> [project.json]

Drives a dedicated app instance over the org.pixelrpg.maker.Control D-Bus
interface (PIXELRPG_INSTANCE=shots), so it never touches a running editor.
Must run inside a headless session (a nested compositor or Xvfb at 1920x1200
or larger), otherwise the window opens on the real desktop and steals focus:

  mkdir -p /tmp/shots && <headless-wrapper> -- \
      python3 scripts/capture-views.py "$PWD" /tmp/shots
"""
import ast, json, os, re, subprocess, sys, time

CO, OUT = sys.argv[1], sys.argv[2]
LABEL = "shots"
BIN = os.path.join(CO, "apps/maker-gjs/org.pixelrpg.maker")
PROJECT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(CO, "games/zelda-like/game-project.json")
gip = subprocess.run(["find", os.path.join(CO, "node_modules"), "-type", "d", "-path", "*/prebuilds/linux-x64"],
                     capture_output=True, text=True).stdout.split()
ENV = {**os.environ, "GI_TYPELIB_PATH": ":".join(gip), "LD_LIBRARY_PATH": ":".join(gip), "PIXELRPG_INSTANCE": LABEL}
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
    v = "" if value is None else json.dumps(json.dumps(value))  # "\"world\"" for gdbus GVariant + app JSON.parse
    r = call("ActivateAction", scope, name, v if v else "''")
    if r.returncode != 0:
        print("ACT FAIL", name, value, r.stderr.strip()[:200])
    time.sleep(1.2)


def shot(tier, name, scope="window"):
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
p = subprocess.Popen([BIN], env=ENV, stdout=log, stderr=log)
try:
    if not wait(lambda s: s.get("mapped"), 90):
        sys.exit("app never came up")
    for tier, w, h in TIERS:
        call("ResizeWindow", str(w), str(h))
        time.sleep(1.5)
        if status()["view"] != "welcome":
            act("close-project")
            wait(lambda s: s["view"] == "welcome", 20)
        shot(tier, "01-welcome")
        call("OpenProject", PROJECT)
        s = wait(lambda s: len(s.get("sceneIds", [])) > 0, 60)
        time.sleep(2)
        act("mode", "world")
        act("atlas-fit")
        shot(tier, "02-world-atlas")
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
        scene = next((i for i in s["sceneIds"] if "kokiri" in i), s["sceneIds"][0])
        act("open-scene-by-id", scene)
        wait(lambda s: s.get("engineReady") and s.get("activeLayer"), 60)
        time.sleep(3)
        shot(tier, "07-map-editor")
        act("toggle-inspector")
        shot(tier, "08-map-editor-inspector-toggled")
        act("toggle-inspector")
        act("toggle-library")
        shot(tier, "09-map-editor-library-toggled")
        act("toggle-library")
        act("full-view", None, scope="app")
        shot(tier, "10-map-editor-fullview")
        act("full-view", None, scope="app")
        act("play")
        wait(lambda s: s.get("isPlaying"), 20)
        time.sleep(3)
        shot(tier, "11-playing")
        act("play")
        time.sleep(1)
        act("back-to-atlas")
        act("close-project")
finally:
    p.terminate()
    time.sleep(1)
    p.kill()
