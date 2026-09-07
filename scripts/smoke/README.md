# Open-a-map smoke harness

Launches the built maker headless, drives it over `org.pixelrpg.maker.Control`,
and reports a **failure rate** over N runs. Written to measure the
"opening a map leaves the editor without an engine" defect; kept because
nothing else in this tree starts the app and asks whether it works.

**Not wired into CI yet** — see "Promoting this to a CI job" below.

## Run it

```bash
# 1. a compositor to render into (own Wayland display, no seat sharing)
./scripts/smoke/mutter.sh &            # WAYLAND_DISPLAY=pixrace

# 2. N runs of one scenario
python3 scripts/smoke/drive.py "$PWD" 20 mytag switch
```

Output goes to `scripts/smoke/out-<tag>/`: one `run-N.log` per FAILING run
(passing runs delete theirs), a `status-fail-N.json` snapshot, and
`result.txt` with the tally.

`drive.py` needs `GI_TYPELIB_PATH` / `LD_LIBRARY_PATH` pointing at the
gjsify prebuilds; it derives both from `node_modules/*/prebuilds/linux-x64`
itself, so run it against a checkout that has had `gjsify install` +
`gjsify foreach build -v -t`.

## Scenarios

| name | what it does |
|---|---|
| `single` | open project, open the startup map |
| `double` | open the same map twice back to back (atlas double-click) |
| `switch` | open map A, immediately open map B |
| `reopen` | open project + map, then open the project AGAIN + map |
| `churn` | open a map, then switch maps 4× fast |
| `enterleave` | open a map / back to the atlas, 8× — each round trip rebuilds the engine widget and its GL context |

## What counts as a pass

`engineReady` **and** `currentSceneId == the map we asked for` **and**
`activeLayer` non-null.

All three, deliberately. `engineReady` alone was true in **every** run of the
`switch` scenario while the editor came up with no active layer — a check
that reads only `engineReady` reports green on an editor you cannot paint in.

## Two traps this harness exists to not fall into

- **`ActivateAction` arguments need two layers of quoting.** `gdbus`
  GVariant-unquotes each argument before the app sees it, and the app then
  `JSON.parse`s what is left. `win open-scene-by-id "kokiri-forest"` reaches
  `JSON.parse` as bare `kokiri-forest`, throws, and the action silently never
  runs — which looks exactly like "the map failed to open". It needs
  `"\"kokiri-forest\""`.
- **Do not grep raw `gdbus` output.** It prints the status string
  single-quoted, but switches to escaped double quotes (`\"engineReady\":true`)
  as soon as the payload contains an apostrophe — and `games/zelda-like` has
  `Link's Tree House`. A `grep '"engineReady":true'` therefore stops matching
  the moment that project is loaded, and every run reads as a failure.
  `status.py` parses the GVariant instead.

## Promoting this to a CI job

The pieces are all here; what is missing is a headless environment in the
`fedora:44` container:

- `dbus-run-session` — the Control interface needs a session bus.
- a compositor. Prefer `weston --backend=headless-backend.so` over
  `mutter --headless`: mutter's headless backend wants logind/a seat and is
  the likelier container flake.
- `mesa-dri-drivers` + `LIBGL_ALWAYS_SOFTWARE=1` for the `Gtk.GLArea`.

Budget generously: a launch took 20–30 s here with hardware GL, and llvmpipe
is slower. Make it its **own** job rather than a step in the build job, so a
compositor flake cannot block unrelated PRs, and upload the failing
`run-N.log` as an artifact — the app log is the only thing that says which
branch of the load path ran.

Porting `drive.py` to `.mjs` would match the other `scripts/check-*.mjs`
guards; Python is used here only because this started as a throwaway rig.
