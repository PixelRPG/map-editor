# Excalibur 1.0 — measured plan

**Status:** planning · last meaningful change 2026-11-16

Two questions, answered with numbers rather than impressions:

1. **Why does the map editor not feel smooth?** Measured, attributed, and — it turns out —
   answered by a single finding that has nothing to do with the engine version.
2. **What does moving from Excalibur `0.32.0` to `1.0.1` cost, and what does it buy?**
   Surveyed against the upstream changelog and this repo's real call sites.

Nothing here is implemented. Section 6 is the step table.

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

**Total mechanical surface:** ~60 call sites, of which ~50 are two renames. The genuine work is
the screen-space change and re-verifying collision behaviour under the new composite strategy.

---

## 4. What 1.0 adds that is worth taking

Each anchored in code we actually have.

| Addition | Where it would land | Worth it? |
|---|---|---|
| **`System.dispose()`** | `packages/engine/src/systems/*` — we currently rely on scene teardown and `EngineController` disposing the whole engine on map leave | **Yes.** Makes per-scene system lifetime explicit, and is the clean hook for O1 (disable collision in editor mode) and O5 (idle the engine behind the World page). |
| **`ex.glsl` + `pixel_texture()` pixel-art filter** | we set `pixelArt: true` globally | **Evaluate.** 0.32's `pixelArt` applies a global filter; the 1.0 helper is per-material. Only interesting if the global one is costing us — it is not, per §2.3. Low priority. |
| **`ShaderPass` / `ShaderPipeline` / `Framebuffer`** | nothing today | **Later.** The obvious future use is the wall-hatch overlay (`wall-hatch.ts`), which currently approximates circles and polygons by their bounding box (see TODO.md). A real shader pass could draw the true outline on every surface at once. Not part of this migration. |
| **Opt-in `lighting`** | nothing today | **No**, for now. A product decision, not a performance one. |
| **Per-constructor `Query` identity fix** | every `System` with a query | **Yes, free.** In 0.32 two systems querying the same component set could share a query object; the fix removes a class of bug we have not hit but could. |
| **Font / Text perf + smaller textures** | `cursor_caption`, remote-peer name labels (`RemoteCursorRenderer`) | **Yes, free.** Collab presence draws text per peer. |
| **Stable pointer ids + `pointercancel`** | `pointer-observers.ts`, `pinch-zoom.ts`, `multi-finger-tap.ts`, `long-press.ts` | **Yes.** Our touch gesture stack reconstructs sequence identity by hand. Stable ids and a real cancel event would simplify it and may fix the "second finger cancels the stroke" half of REDESIGN §5.5 once stroke painting exists. |
| **`Tile.defaultGeometry` invalidation fix when a tilemap moves** | `tilemap-builder.ts`, layer-plane shifts | **Yes, free.** A latent-bug fix in exactly the code path §2.2 is about. |
| **Fixed double resize for window display modes** | `DisplayMode.FillContainer` + `setViewportInset` | **Verify.** We resize on every sheet detent change; if a double resize was happening it would show in `gap` during detent transitions. Not measured — the bench has no detent scenario. |

---

## 5. Optimisations, ranked by measured or estimated impact

`app` = our code · `ex-config` = an Excalibur option or API we are not using · `core-gjsify` = a
fix that belongs in `gjsify/gjsify` (`@gjsify/webgl`, the canvas/rAF shims, GLArea glue).

| # | Optimisation | Tag | Impact | Basis |
|---|---|---|---|---|
| **O1** | **Do not pay collision cost in editor mode.** The editor never simulates: `isRuntimeModeActive(scene)` (`services/runtime-mode.ts`) already distinguishes the two modes and `applyRuntimeMode` already swaps the markers. Switch `physics.enabled` — or better, detach the tilemap's `ColliderComponent` — on that same swap. | app | **~3.8× frame time; update 58 ms → 1.4 ms** | Measured A/B, 2022 frames (§2.1) |
| **O2** | **Stop re-transforming static colliders during Live Run.** Even playing, only the hero moves. Excalibur offers per-collider static handling; at minimum the tilemap's composite should not be rebuilt into a fresh array each frame. | ex-config + app | Est. most of the remaining ~50 ms in `run` | §2.2 mechanism; O1's measurement bounds it from above |
| **O3** | **Build colliders lazily / per plane.** `buildPlaneTileMaps` always builds three TileMaps and folds `tile.solid` for all of them. Only the planes that can block need collision geometry at all, and none need it before first play. | app | Est. 30–60 % of collider count on this map; cuts map-open time too (currently masked by the 4 s settle in the bench) | §1 composition; not yet measured — needs its own run |
| **O4** | **Re-measure `compositeStrategy`** once on 1.0, where the default flips to `'separate'`. | ex-config | Unknown sign. Could help or hurt 5432 boxes. | §3; explicitly a measurement, not a fix |
| **O5** | **Idle the editor engine behind the World page.** The `atlas` scenario shows the editor still ticking a 69 ms frame while the user is looking at a GTK-only page. | app | ~100 % of a frame's cost, while the atlas is open | §1, `atlas` row |
| **O6** | **Drop the bridge's unconditional tick callback + last-frame replay** when a real rAF frame is pending. | core-gjsify | ~1 % of frames; correctness/efficiency, not smoothness | §2.3 |
| **O7** | **Investigate the pan `gap`** (16 ms mean / 22 ms p95, with physics off too). Likely pointer-event delivery cost in the bridge or GTK motion handling. | core-gjsify (probable) + app | Up to ~10 ms on drag frames | §2.4 |
| **O8** | **`System.dispose()` adoption** once on 1.0, so O1 and O5 have a declared lifetime hook rather than ad-hoc flag flipping. | app | 0 ms directly; makes O1/O5 maintainable | §4 |

**O1 is not an Excalibur 1.0 feature and does not need the upgrade.** It can ship first, on 0.32.
The upgrade and the smoothness fix are independent tracks that happen to share a benchmark.

---

## 6. Phased plan

Each step keeps the tree working and updates `TODO.md` plus any affected guard in the same commit.
Measurement steps re-run `frame-bench.py` and commit the resulting `summary.json` under
`scripts/bench/results/`, so every claim stays auditable.

**Phase E — Measure and fix what measuring found (no version change)**

| # | Step | Resolves | Risk / rollback |
|---|---|---|---|
| E0 | ✅ **Baseline benchmark, kept as a repeatable script.** Probe + driver + both result sets land with this document. | "not smooth" was unactionable | Probe is inert without `PIXELRPG_FRAME_PROBE`. Rollback = delete two files. |
| E1 | **O1: collision off in editor mode.** Hang it off `applyRuntimeMode`; add a spec that a scene in editor mode has no active collision processing and that entering Live Run restores it. | ~3.8× frame time | **Risk:** something in the editor silently depends on collision queries (tile picking does not — it goes through `screenToWorldCoordinates`, not a raycast; verify the wall overlay and `agent-map-data.ts`). Rollback = one flag. |
| E2 | **Re-run the bench, commit the numbers.** Compare against `baseline-physics-on.json`. | proves E1 on all six scenarios, not just the A/B | none |
| E3 | **O5: idle the engine behind the World page.** | a full frame cost per tick while the atlas is open | **Risk:** REDESIGN risk 4 — `SceneEditorView` must stay rooted. Idling must not be unrooting. Rollback = one flag. |
| E4 | **O3: build collision geometry lazily / per plane.** Measure collider count and map-open time before and after. | collider count on large maps | **Risk:** a plane that should block stops blocking. Needs a spec per plane. Rollback = revert `tilemap-builder.ts`. |
| E5 | **O2: static colliders during Live Run.** Measure `run` specifically. | the remaining Live Run cost | **Risk:** a moving placement (future feature) would be wrongly treated as static — gate on actual motion, not on mode. |

**Phase X — The 1.0 upgrade**

| # | Step | Resolves | Risk / rollback |
|---|---|---|---|
| X1 | **Bump the pin to `1.0.1` in all four `package.json` files, nothing else.** Expect a red type-check; capture the full error list as the real migration checklist. | the survey in §3 becomes a fact rather than a reading | Rollback = revert one commit. Do not fix anything in this step. |
| X2 | **Mechanical renames**: `Tile.solid`→`isSolid`, `ex.Shape`→`ex.Colliders.*`, `FrameStats.elapsedMs`→`elapsed`, `graphics.visible`→`isVisible`. | ~50 of ~60 sites | **Risk:** over-renaming our own `solid` / `visible` fields. `check:layer-visibility` catches the `layer.visible` half; the `sprites[].solid` half has no guard — review the diff by hand. |
| X3 | **`Loadable.isLoaded()` → getter** across the seven resource classes and their callers. | the interface change | Mechanical; the compiler finds every caller. |
| X4 | **Screen space: `contentArea` / `contentAreaOffset`.** Re-verify all three `screenToWorldCoordinates` callers against `DisplayMode.FillContainer` + `setViewportInset`, including with the phone sheet at Half (where the camera ducks). | tile picking and pointer→world mapping | **Highest risk in the migration.** A silent off-by-inset means every paint lands on the wrong tile. Needs a driven check (`PaintTile` at known coordinates, read back), not a visual one. |
| X5 | **Re-run the bench on 1.0**, compare against the E-phase numbers. Settle **O4** (`compositeStrategy`) here with data. | regression gate for the whole upgrade | If 1.0 is slower, the numbers say where. |
| X6 | **Adopt the free wins**: `System.dispose()` (O8), stable pointer ids in the gesture stack, `Tile.defaultGeometry` fix confirmation. | §4 | Incremental; each independently revertable. |

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
