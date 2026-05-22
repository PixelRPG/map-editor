# TODO

Single source of truth for *deferred* work in this repo. Keep entries terse — one line each, grouped by surface. Resolved items go in commit messages / `git log`, not in a "done" section here.

Conventions:
- **owner**: gjsify | engine | maker | gjs (widget pkg) | tooling | external
- **why**: one-line reason it's deferred
- Cross-reference to issues / PRs / commits when relevant

## Editor / tooling

- **Tool semantics in `@pixelrpg/engine`** — currently `bucket`/`rect`/`select`/`stamp`/`event` all map to `brush` in `ApplicationWindow._installActions` (search `mappedTool`). Implement proper behavior per tool in `packages/engine/src/systems/tile-editor.system.ts`. *owner: engine, why: bigger ECS-side change per tool, deserves its own PR series*
- **File-picker "Save as new project"** — `_onCreateProject` opens the blank template in-place rather than scaffolding a new project file in a user-chosen directory. Needs a save-as flow + `editorData.templateOrigin` tracking. *owner: maker*
- **"Switch tileset" action** — `win.switch-tileset` is registered but no handler. Tiles tab "Switch…" button does nothing. *owner: maker*
- **"New layer" action** — `win.new-layer` registered, no handler. Layers tab "New layer" footer button does nothing. *owner: maker*
- **"New scene" action** — Atlas header "New Scene" button registered as `win.new-scene` but the handler is a placeholder toast. Needs a scene-creation dialog + map scaffolding. *owner: maker*

## Engine / runtime

- **Object-system editor UI follow-ups** — engine side complete (PRs 1–6). PR 7 ships a read-only Objects inspector tab + atlas curves from aggregated placements. Still missing for full feature: (a) Library mode in the mode-rail to CRUD `ObjectDefinition` entries, (b) Object tool in the floating tool-rail to drag-to-place from the library, (c) Per-placement inline editor on selection, (d) `win.new-object` handler. See [`docs/concepts/object-system.md`](docs/concepts/object-system.md) § "How the editor surfaces this". *owner: maker + gjs*
- **Runtime modes — Editor / Full Run / Live Run** — Mario-Maker-style edit-while-playing flow, full design in [`docs/concepts/runtime-modes.md`](docs/concepts/runtime-modes.md). Five phases tracked in that doc's "Where this is implemented" section: mode-marker components + system gating, maker controls (Play / Stop / Reset), ghost-spawn handling in `PlayerSpawnSystem`, Full-Run windowing (GJS-native window + WebKit WebView variant), and future in-game-editor compatibility check. *owner: engine + maker*
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
- **`overrides: { execa: ^9.6.1 }` in root `package.json`** — workaround for a `gjsify install 0.4.21` bug that over-installs devDeps of transitive deps + dedups `execa` to v5 (CJS), which breaks `@gjsify/vite-plugin-blueprint`'s `import { execa }`. Report at `../../gjsify/docs/reports/install-devdeps-and-execa-dedup.md`. Remove the override once gjsify's install no longer pulls extraneous devDeps. *owner: gjsify, blocked: external release*

## Storybook

- **Story for `MapPreview`** — the widget ships without a story; should at least demo solid placeholder + a real loaded project.
- **Story for `FloatingHistory`** — same.

## Format / breaking-change tracker

(Keep this list pruned — only entries the editor relies on but the schema doesn't fully formalise yet.)

- `MapData.editorData.atlasX/atlasY` — atlas-space coords per scene. Consumed by `project-loader.ts`; not yet a typed field on `MapData.editorData` (currently loose-typed).
- `GameProjectData.teleports[]` — typed as `TeleportData[]`, consumed by the atlas. Engine traversal pending (see Engine / runtime).

---

> **Maintenance**: this file plus the structure / governance lines in `AGENTS.md` are the only repo-level notes. Update both in the same commit when work shifts categories or new items arise — drift between AGENTS.md ↔ TODO.md = blocked PR.
