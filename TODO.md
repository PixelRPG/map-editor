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

- **Teleport execution** — `TeleportData` lives in `@pixelrpg/engine` and the atlas already draws teleport curves between maps, but stepping onto a `from` tile does **not** warp the player to `to`. Needs an engine-side system (`TileEditorSystem` neighbour: `TeleportSystem`) that watches for player position and triggers a scene switch + position update. *owner: engine*
- **Teleport editing UI** — atlas view shows teleports read-only. Drag-to-create (pick source tile in scene A, then dest tile in scene B), inline label edit, delete. Currently teleports come from the project file only. *owner: maker + gjs*
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
