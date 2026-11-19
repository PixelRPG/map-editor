# Excalibur 1.0 — measured plan

**Status:** active (E0–E2 landed) · last meaningful change 2026-11-16

Two questions, answered with numbers rather than impressions:

1. **Why does the map editor not feel smooth?** Measured, attributed, and — it turns out —
   answered by a single finding that has nothing to do with the engine version.
2. **What does moving from Excalibur `0.32.0` to `1.0.1` cost, and what does it buy?**
   Surveyed against the upstream changelog and this repo's real call sites.

E1 (O1) and its re-measurement E2 have landed; the rest is still a plan. Section 6 is the step table.

---

## 0. How the numbers were produced

Two pieces, both committed with this document so every number below is reproducible.

| Piece | Path | What it is |
|---|---|---|
| probe | `packages/gjs/src/widgets/engine/frame-probe.ts` | In-app, **off unless `PIXELRPG_FRAME_PROBE` names a file**. Installed in `Engine` right after `await engine.initialize()`, torn down through `_excaliburSubscriptions`. Samples `engine.stats.currFrame` on `preframe`/`postframe` and appends JSON lines. |
| driver | `scripts/bench/frame-bench.py` | Starts the app, drives six scenarios over the `org.pixelrpg.maker.Control` D-Bus interface, slices the probe stream **by its own wall-clock windows** — the app never learns which scenario is running — and reduces it to a Markdown table + `summary.json`. |

```
./scripts/headless-run --size 1920x1200 -- python3 -I scripts/bench/frame-bench.py "$PWD"
```

`frame-bench.py` also takes `--project <game-project.json>` (default: Kokiri Forest), `--map <id>`
(default: the project's startup map), `--size WxH` (`ResizeWindow` after the window is up — the
headless monitor size alone does not resize a window) and `--summary <file>` (also writes the
summary, tagged with project/map/size, e.g. under `scripts/bench/results/`).

**The large map.** Kokiri Forest is ~16.5k ground tiles and ~300 placements; depth sorting, culling
and collision change shape at scale, so `scripts/bench/make-large-map.mjs` writes a 256×256 project
(all three planes filled, 2,000 hero-plane props, 50 people, 20 `combat-action` hostiles) into a
temp directory and prints its path. It is deterministic per `--seed`, never writes under `games/`,
copies the Kokiri sprite sets so it is relocatable, and validates the result with the engine's own
`GameProjectFormat`/`MapFormat`/`SpriteSetFormat` (`scripts/bench/validate-project.mjs`, bundled
on the fly). The 50 people carry an `npc-route` but **stand still**: only `HostileAiSystem` walks
routes today (the 20 hostiles patrol), the general NPC walker is unbuilt (`TODO.md`).

```
P=$(node scripts/bench/make-large-map.mjs --seed 1)
./scripts/headless-run --size 400x880 -- python3 -I scripts/bench/frame-bench.py "$PWD" --project "$P" --size 400x880
```

**P0 baseline** (headless mutter, `main` before depth sorting; frame `el` in ms, p50 / p95; files `scripts/bench/results/p0-<map>-<size>.json`). The phone runs sit on the 60 Hz vsync cap at Kokiri, so only the large map separates there.

| scenario | Kokiri 400×880 | Large 400×880 | Kokiri 1920×1200 | Large 1920×1200 |
|---|---|---|---|---|
| idle | 16.7 / 17.2 | 23.3 / 27.8 | 34.5 / 48.8 | 55.8 / 69.9 |
| pan | 16.7 / 16.8 | 33.3 / 50.0 | 49.9 / 50.1 | 66.7 / 83.4 |
| zoom | 16.7 / 16.8 | 25.5 / 34.1 | 30.5 / 36.8 | 50.8 / 63.6 |
| paint | 16.7 / 16.8 | 24.8 / 36.0 | 36.0 / 39.9 | 61.0 / 94.3 |
| run | 16.7 / 16.8 | 79.8 / 120.0 | 31.9 / 56.9 | 101.5 / 140.9 |

**P1: placements leave the broadphase** (`run` scenario, p50 / p95 ms; files `scripts/bench/results/p1-<map>-<size>.json`). The large map's `run` frame was 45 of 62 ms `CollisionSystem.update`, and a per-phase timing hook showed why: the broadphase, narrowphase and solver together cost ~35 ms because all 2,070 placement actors were `Passive` actors with a tile-sized box, each scanned against the ~28,000 sleeping tile boxes (~900 persistent contacts per frame, consumed by nothing: hostile contact damage is a distance test). `buildPlacementEntity` now spawns placements as `CollisionType.PreventCollision`; only the hero is physics-active.

| | Kokiri 400×880 | Large 400×880 | Kokiri 1920×1200 | Large 1920×1200 |
|---|---|---|---|---|
| P0 run | 16.7 / 16.8 | 79.8 / 120.0 | 31.9 / 56.9 | 101.5 / 140.9 |
| P1 run | 16.7 / 16.8 | 29.5 / 33.2 | 27.9 / 30.6 | 55.2 / 62.5 |

Collision on the large map, per frame at 400×880: broadphase ~25 → 2.3, narrowphase ~5 → 0.05, solver 5–10 → 0.05. What is left (~14 ms, linear in the 28,000 static boxes, not in the placements) is Excalibur iterating the tilemap's one composite every frame: `_updateColliders` ~5, `SparseHashGrid.update` ~6, per-member transform ~2. Taking that out needs collision geometry built per region around the active bodies rather than for the whole map, a redesign, not a flag.

Input helpers (`scripts/bench/pointer-drag.js`, `hold-key.js`) are **GLib-main-loop paced**. This
is not a style choice: `scripts/lib/headless-input.js` spins on monotonic time, and a spin starves
mutter's frame callbacks, so the app stops rendering and the measurement records the rig's own
stall. The same lesson has a second half — `gjs()` in `frame-bench.py` raises on a non-zero exit
and prints the helper's runtime, because a helper that died in ~0.1 s closed the scenario window
early and looked exactly like an app stall. (It had been passing a signature *string* where
`bus.call_sync` wants a `GLib.VariantType`.)

### What is reported, and what is not

Each record carries `el` (the clock's elapsed time for the frame — the pacing number), `u`/`d`
(Excalibur's own update and draw), and `gap` (wall time from the end of the previous frame to the
start of this one: the GLArea render signal, GTK relayout, GJS GC — everything on the main loop
that is not the engine). Per-system durations are sampled one frame in sixty.

- **Spread, not FPS.** 16.7 ms every frame looks smooth; alternating 8 ms / 25 ms looks like
  stutter and averages the same. So: p50 / p95 / p99 / max, the share of frames beyond 2× the
  scenario's own median (`hitch`), and the share outside ±25 % of it (`±25 %`).
- **"Dropped frames" is not computable here.** Under headless mutter there is no physical refresh
  rate to drop against. The honest substitutes are the two spread columns above.
- **`el` understates the worst stalls.** Excalibur's `Clock.update` clamps an elapsed above 200 ms
  to 1 ms. Wall-clock `t` deltas are the truthful pacing signal when a stall is suspected.

### Where headless mutter differs from real hardware

Read the numbers as **ratios and attributions, not as frame times a user would see**:

- No physical refresh rate, so no vsync pacing and no dropped-frame accounting.
- The GL path is whatever mutter's headless backend provides. The bridge did **not** print its
  "GL is rasterised on the CPU" warning, so this was not llvmpipe — but it is not the user's GPU
  either, and `draw` in particular will move on real hardware.
- The compositor has no other clients and no input device; `gap` is therefore a floor.
- CPU-side work (the collision finding in §2) is the part that transfers most directly: it is
  JavaScript in GJS, not GPU work.

Re-run the bench on real hardware before accepting any absolute number as a target.

---

## 1. Baseline — Excalibur 0.32.0, as shipped

Headless mutter, 1920×1200, `games/zelda-like` / `kokiri-forest`, 556 frames sampled.
Raw: `scripts/bench/results/baseline-physics-on.json`.

| scenario | frames | mean | p50 | p95 | p99 | max | hitch >2× | ±25 % | upd | draw | gap | gap p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| idle | 77 | 74.76 | 71.39 | 103.51 | 133.09 | 142.22 | 0 % | 18.2 % | 58.45 | 12.05 | 7.64 | 6.09 |
| pan | 44 | 82.19 | 83.32 | 116.68 | 133.79 | 133.79 | 0 % | 18.2 % | 60.32 | 12.00 | 16.15 | 22.44 |
| zoom | 44 | 69.79 | 64.62 | 97.37 | 127.83 | 127.83 | 0 % | 11.4 % | 54.76 | 9.40 | 5.23 | 5.79 |
| paint | 31 | 69.00 | 64.32 | 71.71 | 129.38 | 129.38 | 3.2 % | 6.5 % | 52.50 | 11.14 | 5.19 | 5.43 |
| run | 177 | 70.20 | 62.97 | 105.58 | 133.75 | 182.22 | 2.8 % | 17.5 % | 55.70 | 8.50 | 5.82 | 6.08 |
| atlas | 1 | 69.11 | — | — | — | — | 0 % | 0 % | 67.23 | 8.00 | 5.31 | 5.31 |

All times in milliseconds. `upd`/`draw`/`gap` are means.

Three things to read off it:

- **The editor idles at ~71 ms per frame.** Doing nothing. No input, no animation, no scrolling.
  That is the floor every other scenario builds on, which is why panning (83 ms) and running
  (63 ms) are not meaningfully different from it — the work that dominates is not the work the
  user asked for.
- **Update is ~80 % of the frame in every scenario** (52–60 ms of a 63–83 ms frame) and barely
  moves between idle and Live Run. Draw is a near-constant 8.5–12 ms.
- **Pacing is as bad as the mean.** p95 is 1.4–1.6× p50 everywhere, and ~18 % of frames sit
  outside ±25 % of their own median in idle, pan and run. Both halves of "not smooth" are
  present: it is slow *and* uneven.

**`atlas` has no frames of its own, by design.** The World page is pure GTK —
`Gtk.ScrolledWindow` + `Gtk.Fixed` in `packages/gjs/src/widgets/editor/atlas-canvas.ts` — not an
Excalibur canvas. The single sample in that row is the *editor's* engine still ticking behind the
World page after `back-to-atlas`, which is itself worth knowing (and is optimisation O5). Atlas
scroll smoothness is a GTK question and this rig cannot answer it.

### Scene composition (constant across all scenarios)

| | value |
|---|---|
| entities alive | 296–309 |
| **colliders tracked by the collision processor** | **5432** |
| drawn images (p50) | 4836 |
| draw calls | 3 (1 during Live Run) |
| renderer swaps | 0 |
| rAF calls per frame | exactly 1 |

`kokiri-forest.json` is 176 × 148 = 26 048 cells (`layer_ground` 16 517 sprites, `layer_overlay`
3196). 5432 of those tiles fold to `tile.solid = true` in `tilemap-builder.ts:96`, and each solid
tile becomes one box inside the TileMap's `CompositeCollider`. Three hundred entities, five
thousand colliders. `tree-house.json` is 21 × 15 — a second map would show a far smaller number,
so **map size is the independent variable** behind everything in §2.

---

## 2. Where the time goes

Four owners share the frame: our code, Excalibur, the `@gjsify/webgl` bridge, GTK. Each was
measured separately.

### 2.1 Excalibur: one system is the whole problem

Per-system means, sampled one frame in sixty:

| scenario | hottest system | next |
|---|---|---|
| idle | `update:CollisionSystem.update` **48.05** | `draw:GraphicsSystem.update` 5.95 |
| pan | `update:CollisionSystem.update` **57.16** | `draw:GraphicsSystem.update` 4.88 |
| run | `update:CollisionSystem.update` **49.89** | `draw:GraphicsSystem.update` 5.29 |

Everything else — `MotionSystem`, `PointerSystem`, `OffscreenSystem` — is under 1.1 ms.

**The A/B that settles it.** The same build with `physics.enabled = false`, 2022 frames
(`scripts/bench/results/baseline-physics-off.json`):

| scenario | frames | mean | p50 | p95 | max | upd | draw |
|---|---|---|---|---|---|---|---|
| idle | 293 | 19.67 | 17.62 | 32.31 | 42.93 | **1.37** | 12.68 |
| pan | 139 | 26.97 | 33.23 | 33.48 | 46.58 | **1.33** | 12.20 |
| zoom | 155 | 17.21 | 16.67 | 19.86 | 28.80 | 1.18 | 9.22 |
| paint | 111 | 18.92 | 17.41 | 29.84 | 32.74 | 1.31 | 12.03 |
| run | 662 | 17.71 | 16.68 | 23.85 | 60.83 | 1.41 | 8.69 |

**Update drops from 58 ms to 1.4 ms. The frame drops ~3.8×, to roughly a 60 Hz budget.** This is
the finding. Everything else in this document is secondary to it.

### 2.2 Why the collision cost exists at all

The `physics.pairs` / `broadphase` / `narrowphase` / `collisions` counters in `FrameStats` read
**zero** in every sample, which initially looked like a contradiction: no collision work, yet
50 ms in `CollisionSystem`. It is not a contradiction — **those counters are structurally
unwritable in 0.32**. Only `DynamicTreeCollisionProcessor` fills them
(`excalibur.js:7050`, `:7120`); the 0.32 default is `SparseHashGridCollisionProcessor`, whose
`broadphase(targets, elapsed)` takes no `stats` argument at all (`excalibur.js:21389`). The
counters were never evidence of anything. Record this: it cost an hour.

The real mechanism is in `CollisionSystem.update` (`excalibur.js` ~22560). Every frame it:

1. walks every `ColliderComponent` in the scene,
2. calls `colliderComp.update()`, re-transforming each collider,
3. **concatenates `CompositeCollider.getColliders()` — all 5432 tile boxes — into a fresh array**,
4. runs the processor over that array.

In the editor **nothing is dynamic**. No actor moves; the tilemap is static between edits. All
5432 re-transforms and the 5432-element array allocation are thrown away every frame, 14 times a
second. During Live Run exactly one actor moves, and the other 5431 boxes still pay full price.

`meshingLookBehind` does **not** fix this — measured, not assumed. `PIXELRPG_MESHING=100000`
(default 10) left the count at 5432 and idle mean at 79.8 ms. The solid tiles in this map do not
form the shared-edge runs the mesher combines, and tiles carrying explicit shapes from
`tile-collider.ts` bypass meshing entirely.

### 2.3 The `@gjsify/webgl` bridge: not the cause

Suspected, measured, cleared.

- **`raf` per frame is exactly 1** in both runs, and the per-run `raf` sum equals the frame count
  exactly. Excalibur's `StandardClock` is the only `requestAnimationFrame` caller; nothing is
  double-driving the canvas.
- The bridge installs an unconditional `add_tick_callback` and replays the last frame when no new
  one arrived. Only **3 of 333 frames** have `el < 2 ms`, so that replay path drives ~1 % of
  engine frames. It is a correctness/efficiency wart worth fixing upstream (O6), **not** the
  stutter.
- `draw` p50 is ≈10.3 ms with physics on and ≈10.7 ms with it off — a fixed floor, independent of
  the CPU load above it. Combined with `drawCalls` = 3 and `rendererSwaps` = 0, the draw path is
  already batched and is not where the win is.

### 2.4 GTK and the main loop

`gap` — everything on the main loop that is not Excalibur — is 5.2–7.6 ms in five of six
scenarios, i.e. a small, steady tax. The exception is **pan: `gap` mean 16.15 ms, p95 22.44 ms**,
and it stays high with physics off (13.41 / 21.84). Dragging therefore costs something outside the
engine — pointer event delivery through the bridge, or GTK work per motion event. It is the one
place where the bridge/GTK side has a measurable signature, and it is ~20 ms, not ~60 ms.

### 2.5 Our code

Nothing in our own systems registers above 1 ms. The app's contribution to the frame cost is not
code that runs per frame — it is the **data shape** described in §1: a map that produces 5432
colliders, built unconditionally in `buildPlaneTileMaps` (`tilemap-builder.ts`) for all three
layer planes whether or not the scene will ever simulate.

### Attribution summary

| owner | share of an idle frame | verdict |
|---|---|---|
| Excalibur `CollisionSystem` | ~48–58 ms (≈75 %) | **the cause** |
| Excalibur draw (`GraphicsSystem` + renderer) | ~10–12 ms | floor; already batched |
| GTK / main loop (`gap`) | ~6 ms (pan: ~16 ms) | small, except under drag |
| `@gjsify/webgl` bridge | ~1 % of frames replayed | not the cause; fix separately |
| our systems | < 1.1 ms total | not the cause (but our *data* is) |

---

## 3. Migrating to 1.0 — per item, against real call sites

Sources: the upstream `CHANGELOG.md` for v1.0.0 (fetched from `excalibur-js/Excalibur` `main`) and
a survey of this tree. Current pin: `^0.32.0` (installed 0.32.0) in `packages/engine`,
`packages/gjs`, `apps/maker-gjs`, `apps/game-browser`. Target `1.0.1`.

Effort: **S** = mechanical rename, no judgement · **M** = needs reading each site · **L** = needs a
decision or a redesign.

| Breaking change | Our call sites | Effort | Note |
|---|---|---|---|
| `Tile.solid` → `Tile.isSolid` | `tilemap-builder.ts:96`, `:134`; `tile-collider.ts`; `MapResource.ts:294`, `:351`; `player.system.ts:159` (comment) | **S** | Beware: `SpriteDataBase.solid`, `TileCollisionRef.solid` and `sprites[].solid` are **our own** schema fields and must NOT be renamed. Rename only where the receiver is an Excalibur `Tile`. |
| `ex.Shape` removed → `ex.Colliders.Box/Circle/Polygon` | `player.system.ts:171`; `tile-collider.ts:37`, `:43`, `:51` | **S** | 4 sites, 1 import. |
| `System.initialize` → `onInitialize`, `System.update` → **abstract** `onUpdate` | all 20 `systems/*.system.ts`, their 23 `super.initialize` guards, and 7 specs that drive a system by hand | **S** (wide) | **Missed by the first survey of the changelog** and by far the largest item: 61 of the 112 type errors from the bump. `onUpdate` is abstract on the 1.0 base class, so every system fails twice — once for the stale `update`, once for the unimplemented `onUpdate`. The `if (super.onInitialize)` guards stay: the base member is optional. |
| `ColliderComponent.set()` → `use()` | `player.system.ts:170` | **S** | Also missed by the first survey. |
| `PolygonCollider.isConvex()` → `checkConvex()` | `tile-collider.ts:52` | **S** | Also missed. Not an accessor conversion — a plain rename, so it does not fall out of the `isX()` → getter row above. |
| `FrameStats.elapsedMs` → `elapsed` | `frame-probe.ts:112` | **S** | The other 13 `elapsedMs` hits in the tree are our own parameter names. |
| `Engine.currentFrameElapsedMs/LagMs` → `currentFrameElapsed/currentFrameLag` | none | — | Unused. |
| Zero-arg `isX()` / `hasX()` become getters | our `Loadable.isLoaded()`: `SpriteSetResource.ts:132`, `:177`; `MapResource.ts:445`; `GameProjectResource.ts:217`; `GdkSpriteSetResource.ts:160`; `GdkImageTexture.ts:109`; `GdkSprite.ts:133` | **M** | These are **our** implementations of Excalibur's `Loadable`, so they must become getters to satisfy the changed interface. Every caller changes with them. |
| `Graphic.visible` → `isVisible` | 42 `graphics.visible` hits (9 in specs) across `packages/engine/src/{commands,entity,scenes,services,systems}` | **M** | Mechanical but wide. **Do not** touch the 5 `layer.visible` sites — that is our own `LayerData` field and `check:layer-visibility` guards it. |
| Screen space rooted at `Screen.contentArea` + `contentAreaOffset` | `tile-editor.system.ts:193`; `pointer-observers.ts:80`, `:106` | **L** | The three `screenToWorldCoordinates` callers. With `DisplayMode.FillContainer` + our `setViewportInset` the content area is not the canvas, so this needs re-verifying against the sheet-ducked camera, not just recompiling. Highest-risk item. |
| `TileMap` default `compositeStrategy` now `'separate'` | `tilemap-builder.ts` (implicit) | **M** | Changes how 5432 tile boxes are grouped. Interacts directly with §2.2 — measure before and after, do not assume a direction. |
| rAF / cAF polyfills removed from Excalibur | — | **S** (verify) | The `@gjsify/webgl` bridge supplies both. Confirm nothing was silently relying on Excalibur's copies. |
| `Material.update()` yields `MaterialContext` | none | — | No `Material` use in the repo. |
| Sound time units now ms | none | — | No `Sound` use. |

**Not a blocker, but plan for it:** the pin appears in four `package.json` files and they must move
together — `packages/engine` and `packages/gjs` both import `excalibur` types that cross the
package boundary.

**Total mechanical surface:** measured, not estimated — the bump produced **112 type errors in 39
files**, of which 61 are the `System` rename and 40 are `graphics.visible`. The survey above
originally predicted ~60 sites because it read the changelog rather than the 1.0 `.d.ts` files;
the three rows marked "missed" are the gap. The genuine work remains the screen-space change and
re-verifying collision behaviour under the new composite strategy.

---

## 4. What 1.0 adds that is worth taking

Each anchored in code we actually have. Settled in X6 — every row below is now taken or skipped
with a reason.

| Addition | Where it would land | Worth it? |
|---|---|---|
| **`System.dispose()`** | `packages/engine/src/systems/*` — we currently rely on scene teardown and `EngineController` disposing the whole engine on map leave | ✅ **Taken (O8), and it was a live bug, not hygiene.** The premise above is false: `ProjectLoader.loadMap` builds a fresh `MapScene` per map and **nothing** tore the old one down — `Director.remove` deletes a lookup entry and `goToScene` touches neither systems nor entities. Twelve systems subscribe in `onInitialize` to emitters that outlive the scene (the engine bus, `engine.input.pointers.primary`), so after N maps one drag panned N times. Now: `SubscriptionScope` + `dispose()` on each, released through `retireScene`. See § 6.4. |
| **`ex.glsl` + `pixel_texture()` pixel-art filter** | we set `pixelArt: true` globally | ⬜ **Skipped.** The global filter is not costing us (§2.3), so a per-material one buys nothing but a second code path. |
| **`ShaderPass` / `ShaderPipeline` / `Framebuffer`** | nothing today | ⬜ **Skipped — a feature, not a migration step.** The wall-hatch true-outline idea stays in TODO.md. |
| **Opt-in `lighting`** | nothing today | ⬜ **Skipped.** A product decision, not a performance one. |
| **Per-constructor `Query` identity fix** | every `System` with a query | ✅ **Taken, no code.** Arrives with the bump; removes a class of bug we had not hit. |
| **Font / Text perf + smaller textures** | `cursor_caption`, remote-peer name labels (`RemoteCursorRenderer`) | ✅ **Taken, no code.** Arrives with the bump; collab presence draws text per peer. |
| **Stable pointer ids + `pointercancel`** | `pointer-observers.ts`, `pinch-zoom.ts`, `multi-finger-tap.ts`, `long-press.ts` | ⬜ **Skipped — the premise was wrong.** The three touch files are in `packages/gjs`, and they are **GTK** gestures (`Gtk.GestureZoom` / `GestureLongPress` / `GestureClick`): GTK already supplies sequence identity (`Gdk.EventSequence`) and its own `cancel`, so Excalibur's pointer ids never reach them. On the Excalibur side, `pointer-observers.ts` and `PointerGestureSystem` read **only** `pointers.primary` — one pointer, no identity to reconstruct — and the gesture system already handles `pointer.on('cancel')`. Nothing to simplify. REDESIGN §5.5's "second finger cancels the stroke" is a GTK-side claim question and stays there. |
| **`Tile.defaultGeometry` invalidation fix when a tilemap moves** | `tilemap-builder.ts`, layer-plane shifts | ✅ **Taken, no code.** Arrives with the bump, in exactly the path §2.2 is about. |
| **Fixed double resize for window display modes** | `DisplayMode.FillContainer` + `setViewportInset` | ⬜ **Not applicable, by reading.** "We resize on every sheet detent change" is false: `Engine.setViewportInset` (`packages/engine/src/engine.ts:369`) writes one field and never touches `Screen` — `screen-coordinates.spec.ts:334` pins that. The fix targets window display modes; we use `FillContainer`. The one double resize we *do* have is **ours and deliberate**: `widget.onResize` writes `screen.resolution` synchronously *and* Excalibur's own `ResizeObserver` fires, because the observer dispatches on a microtask and GTK's next GLArea render can beat it — one frame of uninitialised GL at the new edge, visible as a flash during fast drags (`packages/gjs/src/widgets/engine/engine.ts:927`). Unmeasured either way: the bench has no detent scenario. |

---

## 5. Optimisations, ranked by measured or estimated impact

`app` = our code · `ex-config` = an Excalibur option or API we are not using · `core-gjsify` = a
fix that belongs in `gjsify/gjsify` (`@gjsify/webgl`, the canvas/rAF shims, GLArea glue).

| # | Optimisation | Tag | Impact | Basis |
|---|---|---|---|---|
| **O1** | **Do not pay collision cost in editor mode.** The editor never simulates: `isRuntimeModeActive(scene)` (`services/runtime-mode.ts`) already distinguishes the two modes and `applyRuntimeMode` already swaps the markers. Switch `physics.enabled` — or better, detach the tilemap's `ColliderComponent` — on that same swap. | app | **~3.8× frame time; update 58 ms → 1.4 ms** | Measured A/B, 2022 frames (§2.1) |
| **O2** | ✅ **Take the static tile grid out of the broadphase scan.** The premise above ("stop re-transforming static colliders") was **already fixed upstream in 1.0** and is a large part of the 61 → 25 ms drop. What was left is per-frame *iteration*, and the fix is one call: `PlaneTileMap` puts its `Fixed` body to sleep. **Measured: `run` p50 37.57 → 19.01 ms, `CollisionSystem.update` 23.47 → 4.26 ms.** | app | **−49 % `run` p50; −82 % collision** | § 6.3 |
| **O3** | ✅ **Build colliders lazily / per plane — skipped, with reason.** Per-plane is already free: `TileMap._updateColliders` only emits a box for a tile with `isSolid`, so a plane with no blocking tiles costs nothing today (the three maps are built, not three *collider sets*). The lazy half targets the 5423 boxes themselves, but after O2 the entire `CollisionSystem.update` is 4.26 ms of a 20.5 ms frame and `run` p50 now matches `idle` — so the whole reachable prize is under 4 ms, against a per-frame rebuild cost and a real correctness risk (a fast body leaving the built region). Revisit only if a map lands where `run` is measurably worse than `idle` again. | app | None left worth taking | § 6.3 |
| **O4** | ✅ **Re-measure `compositeStrategy`** once on 1.0, where the default flips to `'separate'`. **Measured: no effect** — `run` p50 36.80 ms (`'together'`) vs 37.57 ms (`'separate'`), ~2 %, inside this bench's run-to-run spread. Now set explicitly in `tilemap-builder.ts` to `'separate'`. | ex-config | None, either way | § 6.2; a measurement that came back neutral |
| **O5** | **Idle the editor engine behind the World page.** The `atlas` scenario shows the editor still ticking a 69 ms frame while the user is looking at a GTK-only page. | app | ~100 % of a frame's cost, while the atlas is open | §1, `atlas` row |
| **O6** | **Drop the bridge's unconditional tick callback + last-frame replay** when a real rAF frame is pending. | core-gjsify | ~1 % of frames; correctness/efficiency, not smoothness | §2.3 |
| **O7** | **Investigate the pan `gap`** (16 ms mean / 22 ms p95, with physics off too). Likely pointer-event delivery cost in the bridge or GTK motion handling. | core-gjsify (probable) + app | Up to ~10 ms on drag frames | §2.4 |
| **O8** | ✅ **`System.dispose()` adoption.** Landed as more than the lifetime hook it was filed as: nothing retired a `MapScene`, so every visited map left twelve live systems subscribed to engine-lifetime emitters and one drag panned once per map seen. `retireScene` now calls `world.clearSystems()` before `removeScene`, and each system releases its handles through a `SubscriptionScope`. | app | A **correctness** fix (pan speed no longer scales with maps visited); 0 ms on the bench, plus one scene's worth of retained memory per switch | § 6.4 |

**O1 is not an Excalibur 1.0 feature and does not need the upgrade.** It can ship first, on 0.32.
The upgrade and the smoothness fix are independent tracks that happen to share a benchmark.

---

## 6. Phased plan

Each step keeps the tree working and updates `TODO.md` plus any affected guard in the same commit.
Measurement steps re-run `frame-bench.py` and commit the resulting `summary.json` under
`scripts/bench/results/`, so every claim stays auditable.

### 6.1 Result of E1 (O1), 1920×1200 headless, `kokiri-forest`

Raw: `scripts/bench/results/o1-collision-in-run.json` against `baseline-physics-on.json` (p50 / upd, ms).

| scenario | before p50 | after p50 | before upd | after upd |
|---|---|---|---|---|
| idle | 71.39 | 19.38 | 58.45 | 3.29 |
| pan | 83.32 | 33.30 | 60.32 | 3.22 |
| zoom | 64.62 | 17.43 | 54.76 | 3.03 |
| paint | 64.32 | 22.81 | 52.50 | 3.98 |
| run | 62.97 | 69.09 | 55.70 | 61.16 |

Idle and pan: update falls ~18×, the frame ~3.7× / ~2.5× (pan is gap-bound, O7). The tracked
collider count in the editor drops from 5432 to 304 (placements only). `upd` here is ~2 ms above the
A/B's 1.4 ms because the probe's sampled frames time every system. **`run` is unchanged within
noise**: collision is genuinely active there, which is O2's job.

**Phase E — Measure and fix what measuring found (no version change)**

| # | Step | Resolves | Risk / rollback |
|---|---|---|---|
| E0 | ✅ **Baseline benchmark, kept as a repeatable script.** Probe + driver + both result sets land with this document. | "not smooth" was unactionable | Probe is inert without `PIXELRPG_FRAME_PROBE`. Rollback = delete two files. |
| E1 | ✅ **O1: collision only while a run is active.** `setCollisionActive(scene, active)` (`services/collision-mode.ts`) is the one switch: it flips the scene's physics world and every `PlaneTileMap` (`resource/plane-tile-map.ts`, builds its boxes only while on — stock `TileMap` rebuilds its composite even with physics off). `applyRuntimeMode` is the single caller that ties it to the run state; `MapScene` starts it off. Spec: `services/collision-mode.spec.ts` (no colliders idle, hero walks through walls in the editor, is stopped in a run, a wall painted mid-run is honoured, second run correct; wall hatching reads tile data and is unaffected). | ~3.8× frame time | Rollback = drop the `setCollisionActive` call in `applyRuntimeMode`/`MapScene`. "Edit while the game runs" changes that one call site. |
| E2 | ✅ **Re-run the bench, commit the numbers.** `scripts/bench/results/o1-collision-in-run.json`; table in § 6.1. | proves E1 | none |
| E3 | **O5: idle the engine behind the World page.** | a full frame cost per tick while the atlas is open | **Risk:** REDESIGN risk 4 — `SceneEditorView` must stay rooted. Idling must not be unrooting. Rollback = one flag. |
| E4 | ✅ **O3: build collision geometry lazily / per plane — not done, deliberately.** Re-measured after E5 instead of built: the target had shrunk below the cost of the mechanism. Reason recorded in § 5 (O3) and § 6.3. | nothing left to resolve | n/a |
| E5 | ✅ **O2: static colliders during Live Run.** `PlaneTileMap.sleepBody()` parks the tilemap's `Fixed` body in Excalibur's dormant state at construction, which lifts every tile proxy out of `broadphase`'s neighbour scan. Specs in `services/collision-mode.spec.ts`. | the remaining Live Run cost | **Risk (as predicted):** a *moving* tilemap would be wrongly treated as static. A `TileMap` cannot move under its own motion — it has no velocity integration path and the editor never animates one — and a future moving tilemap would set `isSleeping = false`, which the body's own `wake()` guard refuses for a non-`Active` type; so such a feature must flip the body to `Active` anyway and would be caught there. Rollback = delete the call. |

### 6.2 Result of X1–X5 (the 1.0.1 upgrade), same rig and map

Raw: `scripts/bench/results/ex1-upgrade.json` against `o1-collision-in-run.json` (p50 / upd, ms).
Both columns already have O1 in them, so this isolates the version change.

| scenario | 0.32 + O1 p50 | 1.0.1 p50 | 0.32 + O1 upd | 1.0.1 upd |
|---|---|---|---|---|
| idle | 19.38 | 19.00 | 3.29 | 2.26 |
| pan | 33.30 | 33.32 | 3.22 | 2.00 |
| zoom | 17.43 | 18.54 | 3.03 | 2.43 |
| paint | 22.81 | 18.00 | 3.98 | 1.99 |
| run | 69.09 | **37.57** | 61.16 | **24.92** |

**The upgrade is worth it for `run` alone: p50 falls 46 %, update 59 %**, with
`CollisionSystem.update` going 55.9 → 23.5 ms on an unchanged collider count (304 editor /
~5415 run) and an unchanged scene. That is 1.0's collision rewrite, not anything we did —
which also means O2 and O3 now have a much smaller target to attack than §5 estimated.
`paint` improves ~21 %; `idle`, `pan` and `zoom` are flat (they are draw- and gap-bound, O7).

**O4, settled here.** The same bench, run end-to-end twice, gives `run` p50 37.57 ms with
`compositeStrategy: 'separate'` and 36.80 ms with `'together'` — ~2 %, which is inside the
spread between two runs of the same configuration. Neither strategy is faster on this map, so
the choice falls to semantics: the two differ only in whether a composite emits one collision
event or one per constituent collider, and we subscribe to no tilemap collision event anywhere
in the workspace. We therefore take 1.0's own new default, `'separate'`, and pass it
**explicitly** in `buildPlaneTileMaps` — necessary because 1.0's `TileMap` constructor assigns
`_strategy = 'separate'` *before* reading `options`, so the physics-config default never
reaches a tilemap and an omitted option would silently track whatever that constructor does in
a later release.

**Phase X — The 1.0 upgrade**

| # | Step | Resolves | Risk / rollback |
|---|---|---|---|
| X1 | ✅ **Bump the pin to `1.0.1` in all four `package.json` files, nothing else.** Expect a red type-check; capture the full error list as the real migration checklist. | the survey in §3 becomes a fact rather than a reading | Rollback = revert one commit. Do not fix anything in this step. |
| X2 | ✅ **Mechanical renames**: `Tile.solid`→`isSolid`, `ex.Shape`→`ex.Colliders.*`, `FrameStats.elapsedMs`→`elapsed`, `graphics.visible`→`isVisible`, **plus `System.initialize`/`update`→`onInitialize`/`onUpdate`** (61 of the 112 errors, and missed by the §3 survey). | 111 of 112 sites | **Risk:** over-renaming our own `solid` / `visible` fields. `check:layer-visibility` catches the `layer.visible` half; the `sprites[].solid` half has no guard — reviewed by hand, our schema fields are untouched. |
| X3 | ✅ **`Loadable.isLoaded()` → getter** across the seven resource classes and their callers. | the interface change | Mechanical; the compiler finds every caller. All seven had to flip together — `new Loader([this.resource])` fails `Loadable<any>[]` as soon as one class lags. |
| X4 | ✅ **Screen space: `contentArea` / `contentAreaOffset`.** Re-verify all three `screenToWorldCoordinates` callers against `DisplayMode.FillContainer` + `setViewportInset`, including with the phone sheet at Half (where the camera ducks). | tile picking and pointer→world mapping | **Billed as the highest risk; turned out to be a no-op for us.** Under `FillContainer` 1.0.1 sets `contentAreaOffset = Vector.Zero` and `contentArea = BoundingBox.fromDimension(resolution, Vector.Zero)`, exactly as 0.32 did, and 1.0 made the pair symmetric (`screenToWorld` adds the offset, `worldToScreen` subtracts it). Confirmed twice: by reading 1.0.1's `Screen` and by `screen-coordinates.spec.ts`, which drives a real `ex.Screen` + `ex.Camera` and passes unchanged on both versions. |
| X5 | ✅ **Re-run the bench on 1.0**, compare against the E-phase numbers. Settle **O4** (`compositeStrategy`) here with data. | regression gate for the whole upgrade | Not a regression: § 6.2, `run` −46 %. |
| X6 | ✅ **Adopt the free wins.** §4 is now fully resolved: three arrive with the bump and need no code (query identity, font/text perf, `Tile.defaultGeometry`), four are skipped with a reason, and the one that needed building — `System.dispose()` (O8) — turned out to be a **correctness fix, not a free win**. Stable pointer ids were skipped on a wrong premise (our touch stack is GTK's). | §4 | O8 is the only code; it reverts as one commit. |

### 6.3 Result of E5 (O2), same rig and map

Raw: `scripts/bench/results/o2-dormant-tilemap.json` against `ex1-upgrade.json` (p50 / upd, ms).
Both columns are 1.0.1 with O1, so this isolates the dormancy change.

| scenario | 1.0.1 p50 | +O2 p50 | 1.0.1 upd | +O2 upd |
|---|---|---|---|---|
| idle | 19.00 | 18.41 | 2.26 | 2.16 |
| pan | 33.32 | 33.30 | 2.00 | 1.93 |
| zoom | 18.54 | 16.75 | 2.43 | 1.99 |
| paint | 18.00 | 18.23 | 1.99 | 2.08 |
| run | 37.57 | **19.01** | 24.92 | **5.72** |

Only `run` moves, which is the point: collision is off everywhere else, so the editor scenarios
are noise either side. `CollisionSystem.update` falls **23.47 → 4.26 ms** on an unchanged collider
count (304 editor / ~5423 run) — and `run` p50 (19.01) now sits on top of `idle` p50 (18.41).
**Live Run no longer costs more than sitting still in the editor.**

**Why one `sleep()` does this.** 1.0's `SparseHashGridCollisionProcessor.broadphase` does not scan
the `targets` it is handed — it walks *every* tracked proxy in the grid and, for each, every
neighbour in each of that proxy's cells, hashing and set-testing each pair before `_canCollide`
rejects it. Static wall-vs-wall is the overwhelming majority of that work and all of it is
discarded. The loop has exactly one early exit we can reach from app code: `proxy.body?.isSleeping`.
Two facts make it a single switch. A tilemap's thousands of tile boxes are member colliders of one
`CompositeCollider` and the processor re-owns them all to the map (`track()`), so every proxy's
`body` is the map's *one* `BodyComponent`. And nothing in Excalibur would ever set it: bodies are
only put to sleep by the Realistic solver's contact islands, and we run Arcade.

Collision survives because dormancy gates the *scan*, not the *pair*. A sleeping wall is still in
its cells and is still found as the neighbour of a moving body, and `Pair.isDormant` cancels a pair
only when both bodies sleep or the awake one is itself `Fixed` — never for the `Active` hero.
`collision-mode.spec.ts` asserts both halves: that the body reports `isSleeping`, and that
`isDormant(wall, hero)` stays false while the hero is still stopped by the wall.

This is also why **O3 is not worth building** (§ 5). The remaining 4.26 ms is the two flat
per-collider loops Excalibur runs regardless of what we do — the `concat` flatten in
`CollisionSystem._updateColliders` and the 5423 map lookups in `SparseHashGrid.update`, both
already version-guarded upstream. Cutting the collider count is the only lever left on them, and
the whole prize is now under 4 ms.

### 6.4 Result of X6 (O8) — a bug the bench cannot see

No bench numbers, and that is the finding: **this one does not move a frame, it moves a
multiplier.** The bench opens one map and stays on it, so every scenario in § 6.1–6.3 was
measured in the single state where the leak is invisible. The cost appears only on the *second*
map, and it is not a slowdown — it is the camera moving twice as far per pixel of drag.

**What was actually broken.** `ProjectLoader.loadMap` rebuilds every room from data and never
returns to the old `MapScene`, but nothing told Excalibur that. `Director.remove` deletes a
lookup entry; `goToScene` deactivates a scene without touching its systems or entities. So the
outgoing scene's systems stayed initialized — and twelve of them subscribe in `onInitialize` to
emitters that belong to the **engine**, not the scene: the typed `EventEmitter<EngineEventMap>`
bus and `engine.input.pointers.primary`. A handler left behind does not go quiet, because it
reads `engine.currentScene.camera` — it steers whatever map is showing *now*. After visiting N
maps, one `POINTER_DRAG_MOVE` ran N pans and one wheel notch ran N zoom steps.

**The fix, in three pieces.** `SubscriptionScope` (`utils/subscription-scope.ts`) collects
`Subscription` handles — the engine-side twin of `SignalScope` in `@pixelrpg/gjs`, same shape at
a different substrate. Each of the twelve systems adds its handles there and releases them in
`dispose()`, which is 1.0's new `SystemManager` teardown hook. `retireScene`
(`engine/scene-swap.ts`) is the single door: `world.clearSystems()` — which runs `dispose()` for
every *initialized* system, in reverse order — then `removeScene`. `swapInScene` calls it for the
map it leaves, after `goToScene` has resolved (Excalibur refuses to remove the active scene) and
never for `root`.

Unregistering the scene also lets its tilemaps, its ~5400 collider boxes and every spawned entity
be collected, which previously survived for the life of the session, once per map visited.

**Pinned by `systems/system-lifetime.spec.ts`**, which drives a real `World` against a fake
engine — `new World(scene)` registers no systems of its own, unlike `new Scene()`, so no screen
or renderer is involved. The first case is a *control*: two live maps, one drag, camera moves
twice. Without it a passing suite would prove nothing, since a system that never subscribed also
never double-pans. Then: `clearSystems()` on the retired map leaves exactly one pan; the same for
the wheel, because pan and zoom ride different emitters and each needs its own release; and both
retired leaves the camera still. Two further cases pin the Excalibur contract the twelve
`dispose()` overrides depend on — `clearSystems()` disposes an initialized system, and does
**not** dispose one that was never initialized (a scene built but never activated holds no
subscriptions). `engine/scene-swap.spec.ts` covers the other half: `retireScene` clears before it
removes, no-ops on an unknown key, and `swapInScene` retires the map it leaves while keeping
`root`.

**Not a leak, checked:** `SessionState.subscribe` is scene-scoped (a per-`Scene` `WeakMap`, and it
returns its own unsubscribe), so it dies with the scene. Only engine-bus and pointer
subscriptions needed the scope.

**Phase C — core gjsify (separate repo, separate PRs)**

| # | Step | Tag | Note |
|---|---|---|---|
| C1 | **O6:** `@gjsify/webgl` should not queue a tick callback + replay the last frame when a real rAF frame is already pending. | core-gjsify | Goes into `gjsify/gjsify`, with a test, following that subproject's conventions — not patched per-consumer. If an interim consumer-side shim is unavoidable it carries a `// fixed upstream in gjsify: …` note. |
| C2 | **O7:** investigate pointer-motion delivery cost (pan `gap` 16 ms / p95 22 ms). Measure in the bridge first; it may turn out to be GTK's own motion compression. | core-gjsify | May conclude "not ours" — that is an acceptable outcome and belongs in the doc either way. |

---

## 7. Questions for the owner

### Decided

1. **The editor needs no collision outside a run.** E1's assumption holds: collision geometry is
   built only while a run is active, not while painting. The door that must stay open is a future
   **"edit while the game runs"** mode — editing a map with the hero simulating in it — which *does*
   need collision in a session that is not a plain Live Run. So O1 may not key off "editor mode" as
   a synonym for "no physics": it keys off whether a run (or that mode) is currently active, and
   E1's spec asserts that shape rather than the two-state one. Live wall feedback while painting
   stays out of physics either way — `agent-map-data.ts`'s grid is the cheap mechanism for it.
2. **Optimise for large maps.** `kokiri-forest` (176 × 148) is not the ceiling: real content spans
   tree-house-sized interiors *up to worlds considerably larger than Kokiri Forest*. So **O3 moves
   up the list** — E1 alone does not finish the job, and every estimate in §5 should be read
   against a map several times this one's size rather than against the bench map.
3. **The probe stays**, and not as debris: it is an officially supported measurement mode, the
   first of several debug options the Maker is expected to grow — plausibly toggleable from the app
   itself rather than only through an environment variable. The next "feels slow" report starts
   with numbers instead of a day of rig building.

### Still open

4. **Upgrade first or fix first?** The two tracks are independent. This document's order (E then
   X) fixes smoothness on the version we already ship and keeps the upgrade a separately
   revertable change.
