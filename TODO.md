# TODO

Single source of truth for *deferred* work in this repo. Keep entries terse — one line each, grouped by surface. Resolved items go in commit messages / `git log`, not in a "done" section here.

Conventions:
- **owner**: gjsify | engine | maker | gjs (widget pkg) | tooling | external
- **why**: one-line reason it's deferred
- Cross-reference to issues / PRs / commits when relevant

## Editor / tooling

- **Tool semantics in `@pixelrpg/engine`** — `bucket` / `rect` / `select` / `stamp` / `event` are accepted by `TileEditorSystem` but short-circuit (no behaviour). Implement proper per-tool behaviour in `packages/engine/src/systems/tile-editor.system.ts`. *owner: engine, why: bigger ECS-side change per tool, deserves its own PR series*
- **File-picker "Save as new project"** — `_onCreateProject` opens the blank template in-place rather than scaffolding a new project file in a user-chosen directory. Needs a save-as flow + `editorData.templateOrigin` tracking. *owner: maker*
- **"Switch tileset" action** — `win.switch-tileset` is registered but no handler. Tiles tab "Switch…" button does nothing. *owner: maker*
- **"New layer" action** — `win.new-layer` registered, no handler. Layers tab "New layer" footer button does nothing. *owner: maker*
- **"New scene" action** — Atlas header "New Scene" button registered as `win.new-scene` but the handler is a placeholder toast. Needs a scene-creation dialog + map scaffolding. *owner: maker*
- **Per-tile collision-shape editor** — Tiles view exposes only a binary Solid switch today. The Tiled `.tsx` porter (`scripts/port-tiled-collision.mjs`) already writes shape-accurate `colliders: ColliderShape[]` (rectangle / polygon / circle) into the sprite-set JSON, but the engine + UI only consume the binary `solid` flag. Build a mini in-place collider editor (draw rectangles / polygons onto the tile preview) and have `MapResource` translate `colliders[]` into per-tile custom Excalibur collider geometry so slopes / corners / partial obstacles work. *owner: gjs + engine, why: needs canvas drawing UX + a collider-translation layer above `tile.solid`*
- **Cast / Character editor polish** — Phase-3 ships a Cast view that displays heroes + NPCs and lets the user edit name / player-flag / movement-speed / per-animation duration. Still missing: (a) "+ New character" / "+ Add custom animation" actually CRUD, (b) frame-timeline drag-to-reorder + frame-picker popover (use the existing `tile-palette` widget in popover mode), (c) frame-by-frame thumbnail preview on each animation row, (d) import-from-Aseprite-JSON wizard, (e) per-NPC dialogue + route inspector. *owner: maker + gjs*

## Engine / runtime

- **Object-system editor UI follow-ups** — engine side complete (PRs 1–6). PR 7 ships a read-only Objects inspector tab + atlas curves from aggregated placements. Still missing for full feature: (a) Library mode in the mode-rail to CRUD `ObjectDefinition` entries, (b) Object tool in the floating tool-rail to drag-to-place from the library, (c) Per-placement inline editor on selection, (d) `win.new-object` handler. See [`docs/concepts/object-system.md`](docs/concepts/object-system.md) § "How the editor surfaces this". *owner: maker + gjs*
- **Runtime modes — Editor / Full Run / Live Run** — Mario-Maker-style edit-while-playing flow, full design in [`docs/concepts/runtime-modes.md`](docs/concepts/runtime-modes.md). Five phases tracked in that doc's "Where this is implemented" section: mode-marker components + system gating, maker controls (Play / Stop / Reset), ghost-spawn handling in `PlayerSpawnSystem`, Full-Run windowing (GJS-native window + WebKit WebView variant), and future in-game-editor compatibility check. *owner: engine + maker*
- **Editor architecture migration — GTK View / ECS Model+Controller hybrid** — session state moves into components on a singleton entity in the engine's world; widgets become subscribing views. Design + 5-phase migration in [`docs/concepts/editor-architecture.md`](docs/concepts/editor-architecture.md). Phase 1 (mode markers + singleton + subscription bridge) folds into the runtime-modes PR series; phases 2–5 (`ActiveTool` / `ActiveTile` + `ActiveLayer` / `Selection` / `UndoStack`) follow incrementally. Foundation for the future console-port path. *owner: engine + maker*
- **Collaboration & multiplayer — op-log + host-sequencer** — single sync mechanism for both collaborative editing and networked multiplayer (Player 1 = host). Design in [`docs/concepts/collaboration-and-multiplayer.md`](docs/concepts/collaboration-and-multiplayer.md). Phase 0 ("substrate constraints") is active and folds into the editor-architecture migration phases: stable IDs audited, mutation API operation-oriented (so Undo == op-log), `InputSourceComponent` introduced with player-movement, schema kept transport-friendly. Phases 1–7 (op-log skeleton → WebRTC transport → editor awareness → split-screen → game ops → prediction → mid-session join) follow once the editor architecture lands. Phase 8 (host migration on disconnect) deferred. *owner: engine + maker, blocks: nothing critical — all current PRs are forward-compatible*
- **Loro evaluation (parallel)** — separate gjsify integration test underway evaluating Loro as a CRDT option. If Loro proves stable in GJS + WebRTC-capable, we may reconsider a hybrid where the editor uses Loro for offline-merge while the game keeps op-log. Decide once the integration test reports — see open question in `docs/concepts/collaboration-and-multiplayer.md`. *owner: external (gjsify track)*
- **Engine-side teleport / item-pickup wiring** — `TeleportSystem` emits `teleport-requested`, `ItemPickupSystem` emits `item-picked-up`, but neither has a host listener yet. Once a runtime app (game-browser or future) plays the game, the host engine subscribes and calls `Engine.loadMap` + repositions the player. *owner: engine + project layer*
- **Player movement / input system** — `TriggerSystem` and `WalkOnTileSystem` listen on `player-tile-changed` / `player-action-pressed`, but nothing emits those today. A project-layer movement+input system emits them when grid movement crosses a tile boundary or the action button fires. *owner: project layer*
- **Scratchpad stripes inside Excalibur** — backdrop is currently a solid `--scratchpad-b` color (theme-aware). Bring back the diagonal stripes from the design via a tiled scratchpad actor in the editor scene. *owner: engine — needs an `EditorBackgroundLayer` actor*
- **Engine canvas transparency** — `Gtk.GLArea` `has_alpha(true)` + `Color.Transparent` clear + `.engine-canvas` CSS — all three failed on this stack. Report filed at `../../gjsify/docs/reports/webgl-bridge-resize-observer.md` (also covers the resize issue). *owner: gjsify, blocked: external release*
- **`FillContainer` resize** — switching to `DisplayMode.FillContainer` is in but Excalibur's `ResizeObserver(parent)` never fires on this stack. Same handoff report. *owner: gjsify, blocked: external release*

## Atlas / world

- **Real scene-card thumbnails for very large maps** — `MapPreview` works but a 176×148 map renders ~26k snapshot ops. Acceptable today; if it becomes a bottleneck cap the max ops per preview (downsample, every Nth tile). *owner: gjs (MapPreview)*

## Welcome / project lifecycle

- **Template thumbnail caching** — every welcome show currently reloads each template's project + sprite-sets to render previews. Cache rendered previews in a `WeakMap<projectPath, Gdk.Texture>` once the first paint lands. *owner: maker / gjs*

## Cleanup / debt

- **`mockups/PixelRPGEditor_01.pdf`** — design PDF, untracked. Decide whether to commit (under `design/`?) or `.gitignore`. *owner: human*

## Storybook

- **Story for `MapPreview`** — the widget ships without a story; should at least demo solid placeholder + a real loaded project.
- **Story for `FloatingHistory`** — same.

## Format / breaking-change tracker

(Keep this list pruned — only entries the editor relies on but the schema doesn't fully formalise yet.)

- `MapData.editorData.atlasX/atlasY` — atlas-space coords per scene. Consumed by `project-loader.ts`; not yet a typed field on `MapData.editorData` (currently loose-typed).
- `GameProjectData.teleports[]` — typed as `TeleportData[]`, consumed by the atlas. Engine traversal pending (see Engine / runtime).

---

> **Maintenance**: this file plus the structure / governance lines in `AGENTS.md` are the only repo-level notes. Update both in the same commit when work shifts categories or new items arise — drift between AGENTS.md ↔ TODO.md = blocked PR.
