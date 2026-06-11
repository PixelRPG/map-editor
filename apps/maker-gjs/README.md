# @pixelrpg/maker-gjs

The PixelRPG map editor — a GTK4/libadwaita application for the GNOME desktop.

Single-process: the [`@pixelrpg/engine`](../../packages/engine) (Excalibur.js) runs directly in GJS via gjsify and is hosted as a GTK widget alongside the Adwaita UI panels.

## Run

```bash
gjsify workspace @pixelrpg/maker-gjs build
gjsify workspace @pixelrpg/maker-gjs start

# With GTK Inspector for debugging
gjsify workspace @pixelrpg/maker-gjs start:debug
```

Application ID: `org.pixelrpg.maker`. Resources are bundled into a GResource file (`org.pixelrpg.maker.data.gresource`) at build time.

## What works today

See the [project README](../../README.md#status) for the full feature list — tile + object editing with undo/redo, the entity-composition content model, the seven editor views (Welcome / Atlas / Cast / Objects / Sheets / Scene editor / Data), in-editor Play mode, WebRTC pair-editing, and the AI collaborator driveable over D-Bus/MCP.

## Project layout

```
src/
├── application.ts          # GApplication subclass
├── main.ts                 # entry point
├── constants.ts
├── widgets/                # GTK views (.ts + .blp [+ .css] per widget):
│                           #   application-window, welcome-view, atlas-view,
│                           #   cast-view, objects-view, tiles-view (Sheets),
│                           #   scene-editor-view, data-view, share-dialog,
│                           #   preferences-dialog
└── services/               # controller layer: project load/save, collab
                            # session + signalling, cast/objects controllers,
                            # control D-Bus service, …
```

UI is defined declaratively in Blueprint (`.blp`) files; widget classes wire signals via `@Gtk.Template.Callback`. Unit tests are `*.spec.ts` registered in `src/test.mts` (`gjsify test`).

## Build pipeline

`gjsify run build` runs three steps:

1. `build:resources` — `gjsify gresource` packs Blueprint UI + CSS + assets into the `.gresource` file
2. `build:barrels` — `gjsify barrels` regenerates `index.ts` barrel exports
3. `build:app` — `gjsify build` bundles `src/main.ts` to a single executable `org.pixelrpg.maker`

## Related

- [Project README](../../README.md) — project overview and architecture
- [`@pixelrpg/engine`](../../packages/engine) — engine API
- [`@pixelrpg/gjs`](../../packages/gjs) — reusable widgets
- [AGENTS.md](../../AGENTS.md) — coding conventions (ECS patterns, Blueprint, GTK4 lifecycle)
