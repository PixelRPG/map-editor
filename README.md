# PixelRPG Map Editor

A modern, GTK4-native RPG map editor for the GNOME platform. Combines [Excalibur.js](https://excaliburjs.com/) as the in-process game engine with [libadwaita](https://gnome.pages.gitlab.gnome.org/libadwaita/)'s UI patterns. Inspired by RPG Maker, designed to be more modern.

## Status

Early development. What works today:

- Tile placement and removal via brush + eraser tools
- Multi-layer maps with tileset selection
- Live preview of edited maps in an embedded Excalibur canvas

Active focus areas:

- Code stabilization (current branch)
- UI overhaul (separate work track, planned)

## Architecture

Single-process GTK4 application — no WebView, no RPC. Excalibur runs directly in the GJS runtime via [gjsify](https://github.com/gjsify/gjsify):

```
┌────────────────────────────────────────────────────────────┐
│  Adwaita Window                                            │
│  ┌─────────────┐  ┌──────────────────────────────────────┐ │
│  │ Tileset     │  │ Engine Widget (GTK)                  │ │
│  │ Selector    │  │  └─ Excalibur canvas (TileMap, ECS)  │ │
│  │ Layers      │  │                                      │ │
│  │ Tools       │  │                                      │ │
│  └─────────────┘  └──────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

The previous architecture (PR #5 and earlier) used a WebKit WebView with RPC between the GTK UI and an Excalibur canvas in a webview. That bridge is gone. PR #6 then collapsed 10+ packages with `*-core`/`*-excalibur`/`*-web` suffixes into the three packages described below.

## Workspace

| Path | Purpose |
|---|---|
| [`packages/engine`](packages/engine) | Excalibur-based engine + editor logic (Resources, Components, Systems, MapFormat) |
| [`packages/gjs`](packages/gjs) | GTK4/libadwaita widgets that host the engine + Gdk-side preview pipeline |
| [`packages/story-gjs`](packages/story-gjs) | Storybook-style framework for GTK widget stories |
| [`apps/maker-gjs`](apps/maker-gjs) | The map editor application (primary) |
| [`apps/storybook-gjs`](apps/storybook-gjs) | Component playground for `packages/gjs` widgets |
| [`apps/game-browser`](apps/game-browser) | Browser-runtime template — seed for multi-platform game export |
| [`games/zelda-like`](games/zelda-like) | Sample game assets used by the editor and storybook |

The maker stays GJS-only. Exported games target multiple platforms — Browser is the first export target (`apps/game-browser` is the runtime seed).

## Quickstart

Prerequisites: Node 18+, Yarn 4, a GNOME development environment with GJS, GTK 4, libadwaita, and `blueprint-compiler`.

```bash
git clone https://github.com/PixelRPG/map-editor.git
cd map-editor

yarn install
yarn build
yarn workspace @pixelrpg/maker-gjs start
```

## Development

```bash
yarn workspaces foreach -A run check          # type-check all packages
yarn build                                     # build all packages
yarn workspace @pixelrpg/maker-gjs start       # run the editor
yarn workspace @pixelrpg/storybook-gjs start   # run the widget storybook
yarn workspace @pixelrpg/game-browser build    # build the browser-runtime template
```

Per-package scripts use the same names: `build`, `check`, `start`.

For development conventions (commit style, ECS patterns, Blueprint UI, GTK4 lifecycle hooks), see [AGENTS.md](AGENTS.md).

## Stack

- [Excalibur.js](https://excaliburjs.com/) — game engine (ECS, TileMap, input)
- [GJS](https://gjs.guide/) — JavaScript bindings for GNOME
- [GTK 4](https://gtk.org/) + [libadwaita](https://gnome.pages.gitlab.gnome.org/libadwaita/) — desktop UI
- [Blueprint](https://jwestman.pages.gitlab.gnome.org/blueprint-compiler/) — declarative UI markup
- [gjsify](https://github.com/gjsify/gjsify) — TypeScript build tooling for GJS

## License

See [LICENSE](LICENSE).
