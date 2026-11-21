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
TIER_SHOTS = ["01-welcome", "02-world-atlas", "02b-world-selected", "02c-world-sidebar", "02d-world-sidebar-hidden",
              "03-library-characters", "03b-cast-cell-menu", "04-library-things",
              "05-library-graphics-fullview", "06-game", "06b-game-rules", "07-map-editor",
              "07-map-editor-zoom-0.75", "07-map-editor-zoom-0.3",
              "08-map-editor-inspector-toggled", "09-map-editor-fullview", "10-playing", "11-together"]
TERRAIN_SHOTS = ["12-tileset-detail", "13-terrain-dialog", "14-terrain-find"]
CREDIT_SHOTS = ["15-game-credits", "15b-credit-dialog"]
SHELF_SHOTS = ["16-starter-shelf", "16b-starter-empty"]
LIVE_SHOTS = ["17-pack-added", "17b-pack-credit", "17c-pack-twice"]
GFX_SHOTS = ["19-graphics-empty", "19b-graphics-pack-added"]
DEPTH_SHOTS = ["08b-placement-depth"]
NEWMAP_SHOTS = ["18-new-map-dialog", "18b-new-map-created", "18c-new-map-shelf"]

ap = argparse.ArgumentParser()
ap.add_argument("checkout")
ap.add_argument("outdir")
ap.add_argument("project", nargs="?")
ap.add_argument("--lang")
ap.add_argument("--only")
args = ap.parse_args()
CO, OUT = args.checkout, args.outdir
ONLY = set(args.only.split(",")) if args.only else None
ALL_SHOTS = TIER_SHOTS + TERRAIN_SHOTS + CREDIT_SHOTS + SHELF_SHOTS + LIVE_SHOTS + GFX_SHOTS + NEWMAP_SHOTS + DEPTH_SHOTS
if ONLY and ONLY - set(ALL_SHOTS):
    ap.error("unknown shot id(s) %s; valid: %s" % (", ".join(sorted(ONLY - set(ALL_SHOTS))), ", ".join(ALL_SHOTS)))
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


def monitor_shot(tier, name, w, h):
    # A popover is its own surface, so the window screenshot never holds it:
    # grab the monitor instead and crop to the window (centred on the monitor).
    if ONLY and name not in ONLY:
        return
    mark(f"shot {name} (monitor)")
    time.sleep(0.8)
    os.makedirs(os.path.join(OUT, tier), exist_ok=True)
    path = os.path.join(OUT, tier, f"{name}.png")
    full = path + ".full.png"
    lib = os.environ["HEADLESS_RUN_LIB"]
    r = subprocess.run(["gjs", "-m", os.path.join(lib, "window-shot.js"), "capture", full],
                       capture_output=True, text=True, timeout=90)
    if r.returncode != 0 or not os.path.exists(full):
        print("SHOT FAIL", tier, name, r.stderr[:200])
        return
    mw, mh = (int(v) for v in os.environ.get("HEADLESS_RUN_SIZE", "1920x1200").split("x"))
    # mutter centres a new window on the monitor.
    subprocess.run(["magick", full, "-crop", f"{w}x{h}+{(mw - w) // 2}+{(mh - h) // 2}", "+repage", path], check=True)
    os.remove(full)
    print("ok", path)


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


def capture_credits(tier, w, h):
    # Own process: the credit dialog is modal and no Control action closes it.
    p = subprocess.Popen([BIN], env=ENV, stdout=log, stderr=log)
    try:
        if not wait(lambda s: s.get("mapped"), 90):
            sys.exit("app never came up")
        call("ResizeWindow", str(w), str(h))
        time.sleep(1.5)
        call("OpenProject", PROJECT)
        wait(lambda s: len(s.get("sceneIds", [])) > 0, 60)
        time.sleep(2)
        act("mode", "game")
        act("game-section", "about")
        act("dismiss-toasts")
        shot(tier, "15-game-credits")
        act("edit-credit", "kokiri-forest-map")
        time.sleep(1)
        shot(tier, "15b-credit-dialog")
    finally:
        p.terminate()
        try:
            p.wait(10)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait()


def tileless_project():
    # blank-starter with its tileset taken out: the Brush page's empty state.
    import shutil, tempfile
    dst = os.path.join(tempfile.mkdtemp(prefix="starter-empty-"), "p")
    shutil.copytree(os.path.join(CO, "games/blank-starter"), dst)
    for rel in ["game-project.json"] + [os.path.join("maps", f) for f in os.listdir(os.path.join(dst, "maps"))]:
        path = os.path.join(dst, rel)
        data = json.load(open(path))
        data["spriteSets"] = []
        json.dump(data, open(path, "w"))
    return os.path.join(dst, "game-project.json")


def capture_shelf(tier, w, h):
    # Own process per project: the shelf on a map that has a tileset (the
    # zelda-like one, which does not hold the pack yet), then the empty
    # state of a project with none.
    for name, project in (("16-starter-shelf", PROJECT), ("16b-starter-empty", None)):
        if ONLY and name not in ONLY:
            continue
        project = project or tileless_project()
        p = subprocess.Popen([BIN], env=ENV, stdout=log, stderr=log)
        try:
            if not wait(lambda s: s.get("mapped"), 90):
                sys.exit("app never came up")
            # The phone sheet opens at half height, which leaves the shelf below
            # the fold; a taller window shows it without a pointer drag.
            call("ResizeWindow", str(w), str(2000 if tier == "phone" else h))
            time.sleep(1.5)
            call("OpenProject", project)
            s = wait(lambda s: len(s.get("sceneIds", [])) > 0, 60)
            time.sleep(2)
            scene = next((i for i in s["sceneIds"] if "kokiri" in i), s["sceneIds"][0])
            act("open-scene-by-id", scene)
            wait(lambda s: s.get("engineReady") and s.get("activeLayer"), 60)
            act("dismiss-toasts")
            act("sheet-page", "brush")  # sheet on phone, drawer when wide
            shot(tier, name)
        finally:
            p.terminate()
            try:
                p.wait(10)
            except subprocess.TimeoutExpired:
                p.kill()
                p.wait()


def capture_live(tier, w, h):
    # Tap the Roguelike card on a project without it, twice, and count what
    # reached disk: the set, the credit and the map reference must each be 1.
    project = tileless_project()
    root = os.path.dirname(project)
    p = subprocess.Popen([BIN], env=ENV, stdout=log, stderr=log)
    try:
        if not wait(lambda s: s.get("mapped"), 90):
            sys.exit("app never came up")
        call("ResizeWindow", str(w), str(2000 if tier == "phone" else h))
        time.sleep(1.5)
        call("OpenProject", project)
        s = wait(lambda s: len(s.get("sceneIds", [])) > 0, 60)
        time.sleep(2)
        act("open-scene-by-id", s["sceneIds"][0])
        wait(lambda s: s.get("engineReady") and s.get("activeLayer"), 60)
        act("dismiss-toasts")
        act("sheet-page", "brush")
        act("add-starter-pack", "roguelike")
        time.sleep(2)
        act("dismiss-toasts")
        shot(tier, "17-pack-added")

        def counts():
            proj = json.load(open(project))
            maps = [json.load(open(os.path.join(root, "maps", f))) for f in sorted(os.listdir(os.path.join(root, "maps")))]
            return (len(proj["spriteSets"]), len(proj.get("credits", [])), [len(m.get("spriteSets", [])) for m in maps])

        once = counts()
        act("add-starter-pack", "roguelike")
        time.sleep(2)
        shot(tier, "17c-pack-twice")
        twice = counts()
        print(f"COUNTS {tier} once={once} twice={twice} same={once == twice}")
        act("mode", "game")
        act("game-section", "about")
        act("dismiss-toasts")
        shot(tier, "17b-pack-credit")
    finally:
        p.terminate()
        try:
            p.wait(10)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait()


def capture_graphics(tier, w, h):
    # The Graphics empty state of a project with no pictures: tap a pack
    # there, twice, and count what reached disk (set, credit once each).
    project = tileless_project()
    p = subprocess.Popen([BIN], env=ENV, stdout=log, stderr=log)
    try:
        if not wait(lambda s: s.get("mapped"), 90):
            sys.exit("app never came up")
        call("ResizeWindow", str(w), str(h))
        time.sleep(1.5)
        call("OpenProject", project)
        wait(lambda s: len(s.get("sceneIds", [])) > 0, 60)
        time.sleep(2)
        act("mode", "library")
        act("library-chip", "graphics")
        act("dismiss-toasts")
        shot(tier, "19-graphics-empty")

        def counts():
            proj = json.load(open(project))
            return (len(proj["spriteSets"]), len(proj.get("credits", [])))

        act("add-starter-pack", "roguelike")
        end = time.time() + 30
        while time.time() < end and counts()[0] < 1:
            time.sleep(0.5)
        act("dismiss-toasts")
        shot(tier, "19b-graphics-pack-added")
        once = counts()
        act("add-starter-pack", "roguelike")
        time.sleep(2)
        print(f"COUNTS-GFX {tier} once={once} twice={counts()} same={once == counts()}")
    finally:
        p.terminate()
        try:
            p.wait(10)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait()


def capture_newmap(tier, w, h):
    # Own process per shot: the dialog is modal and Control cannot close it.
    import shutil, tempfile
    for name in ("18-new-map-dialog", "18c-new-map-shelf", "18b-new-map-created"):
        if ONLY and name not in ONLY:
            continue
        if name == "18c-new-map-shelf":
            project = tileless_project()
        else:  # a copy: creating a map writes into the project
            dst = os.path.join(tempfile.mkdtemp(prefix="newmap-"), "p")
            shutil.copytree(os.path.join(CO, "games/blank-starter"), dst)
            project = os.path.join(dst, "game-project.json")
        p = subprocess.Popen([BIN], env=ENV, stdout=log, stderr=log)
        try:
            if not wait(lambda s: s.get("mapped"), 90):
                sys.exit("app never came up")
            call("ResizeWindow", str(w), str(h))
            time.sleep(1.5)
            call("OpenProject", project)
            s = wait(lambda s: len(s.get("sceneIds", [])) > 0, 60)
            time.sleep(2)
            act("mode", "world")
            act("dismiss-toasts")
            if name == "18b-new-map-created":
                before = len(s["sceneIds"])
                act("new-map-with", ["Meadow", "roguelike", 5])
                s = wait(lambda s: len(s.get("sceneIds", [])) > before and s.get("engineReady") and s.get("activeLayer"), 60)
                time.sleep(4)
                act("dismiss-toasts")
            else:
                act("new-map")
                time.sleep(4)
            shot(tier, name)
        finally:
            p.terminate()
            try:
                p.wait(10)
            except subprocess.TimeoutExpired:
                p.kill()
                p.wait()


def capture_depth(tier, w, h):
    # Own process, sized before the project opens: the phone sheet measures
    # its Half detent once, so a tall window is the only way to show the
    # whole Selected page without a drag.
    p = subprocess.Popen([BIN], env=ENV, stdout=log, stderr=log)
    try:
        if not wait(lambda s: s.get("mapped"), 90):
            sys.exit("app never came up")
        call("ResizeWindow", str(w), str(1800 if tier == "phone" else h))
        time.sleep(1.5)
        call("OpenProject", PROJECT)
        s = wait(lambda s: len(s.get("sceneIds", [])) > 0, 60)
        time.sleep(2)
        scene = next((i for i in s["sceneIds"] if "kokiri" in i), s["sceneIds"][0])
        act("open-scene-by-id", scene)
        wait(lambda s: s.get("engineReady") and s.get("activeLayer"), 60)
        act("dismiss-toasts")
        act("select-placement", "p-layer_12-17")
        act("sheet-page", "selected")
        shot(tier, "08b-placement-depth")
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
        if tier == "phone":  # the Maps overlay (wide shows the pinned column)
            act("toggle-map-sidebar")
            shot(tier, "02c-world-sidebar")
            act("toggle-map-sidebar")
        else:  # F9: the fitted atlas re-fits into the freed column
            act("toggle-map-sidebar")
            shot(tier, "02d-world-sidebar-hidden")
            act("toggle-map-sidebar")
        act("mode", "library")
        for i, chip in enumerate(["characters", "things"]):
            act("library-chip", chip)
            shot(tier, f"0{3 + i}-library-{chip}")
            if chip == "characters":
                # The matrix sits below the fold, so the action scrolls it in and
                # opens a filled cell's "⋯" menu (no pointer, no fixed sleep).
                act("open-character", "scientist")  # drills into the detail on a phone
                act("show-animation-menu", "walk-right")
                monitor_shot(tier, "03b-cast-cell-menu", w, h)
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
    if not ONLY or ONLY & set(CREDIT_SHOTS):
        capture_credits(tier, w, h)
    if not ONLY or ONLY & set(SHELF_SHOTS):
        capture_shelf(tier, w, h)
    if not ONLY or ONLY & set(LIVE_SHOTS):
        capture_live(tier, w, h)
    if not ONLY or ONLY & set(GFX_SHOTS):
        capture_graphics(tier, w, h)
    if not ONLY or ONLY & set(NEWMAP_SHOTS):
        capture_newmap(tier, w, h)
    if not ONLY or ONLY & set(DEPTH_SHOTS):
        capture_depth(tier, w, h)
