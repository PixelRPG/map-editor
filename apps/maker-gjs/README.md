# @pixelrpg/maker-gjs

The PixelRPG map editor — a GTK4/libadwaita application for the GNOME desktop.

Single-process: the [`@pixelrpg/engine`](../../packages/engine) (Excalibur.js) runs directly in GJS via gjsify and is hosted as a GTK widget alongside the Adwaita UI panels.

## Run

```bash
yarn workspace @pixelrpg/maker-gjs build
yarn workspace @pixelrpg/maker-gjs start

# With GTK Inspector for debugging
yarn workspace @pixelrpg/maker-gjs start:debug
```

Application ID: `org.pixelrpg.maker`. Resources are bundled into a GResource file (`org.pixelrpg.maker.data.gresource`) at build time.

## What works today

- Tile placement and removal via brush + eraser tools
- Multi-layer maps with tileset selection
- Live preview in the embedded engine widget

## Project layout

```
src/
├── application.ts          # GApplication subclass, registers actions
├── main.ts                 # entry point
├── widgets/                # GTK widgets (.ts + .blp + .css triples)
│   ├── application-window  # main window
│   ├── sidebar             # left panel (layers, tools, tileset selector)
│   ├── project-view        # project explorer
│   ├── welcome-view        # initial empty state
│   ├── preferences-dialog
│   └── layer-row.widget    # row in the layer list
└── objects/
    └── layer.ts            # layer data shape
```

UI is defined declaratively in Blueprint (`.blp`) files; widget classes wire signals via `@Gtk.Template.Callback`.

## Build pipeline

`yarn build` runs three steps:

1. `build:resources` — `gjsify gresource` packs Blueprint UI + CSS + assets into the `.gresource` file
2. `build:barrels` — `barrelsby` regenerates `index.ts` barrel exports
3. `build:app` — `gjsify build` bundles `src/main.ts` to a single executable `org.pixelrpg.maker`

## Related

- [Project README](../../README.md) — project overview and architecture
- [`@pixelrpg/engine`](../../packages/engine) — engine API
- [`@pixelrpg/gjs`](../../packages/gjs) — reusable widgets
- [AGENTS.md](../../AGENTS.md) — coding conventions (ECS patterns, Blueprint, GTK4 lifecycle)
