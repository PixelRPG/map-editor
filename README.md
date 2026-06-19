# PixelRPG Map Editor

A modern, GTK4-native RPG map editor for the GNOME platform. Combines [Excalibur.js](https://excaliburjs.com/) as the in-process game engine with [libadwaita](https://gnome.pages.gitlab.gnome.org/libadwaita/)'s UI patterns. Inspired by RPG Maker, designed to be more modern.

## Status

Early development (pre-release file format). What works today:

- Tile painting/erasing and object placement on multi-layer maps, with command-based undo/redo
- Entity-composition content model — reusable entity definitions (`components[]` + registry-generated inspectors) for NPCs, items, teleports, spawn points
- Editor views: Welcome (templates + recents), Atlas (world overview), Cast (characters), Objects (entity library), Sheets (tilesets + appearances/animations), Scene editor, Data
- Live editing in an embedded Excalibur canvas + in-editor Play mode (player spawn + grid movement)
- Collaborative pair-editing over WebRTC (LAN discovery via Avahi, live cursors + presence, snapshot-on-join)
- An in-process AI collaborator driveable over D-Bus/MCP (`apps/mcp-bridge`), visible as a live participant
- Responsive chrome from phone width up to desktop (libadwaita breakpoints)

Deferred work is tracked in [TODO.md](TODO.md); design decisions live in [docs/concepts/](docs/concepts/).

## Architecture

Single-process GTK4 application — no WebView, no RPC. Excalibur runs directly in the GJS runtime via [gjsify](https://github.com/gjsify/gjsify):

```
┌────────────────────────────────────────────────────────────┐
│  Adwaita Window (view stack: welcome/atlas/cast/objects/…) │
│  ┌─────────────┐  ┌──────────────────────────────────────┐ │
│  │ Inspector   │  │ Engine Widget (GTK)                  │ │
│  │ sidebars +  │  │  └─ Excalibur canvas (TileMap, ECS)  │ │
│  │ floating    │  │                                      │ │
│  │ OSD chrome  │  │                                      │ │
│  └─────────────┘  └──────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

The previous architecture (PR #5 and earlier) used a WebKit WebView with RPC between the GTK UI and an Excalibur canvas in a webview. That bridge is gone. PR #6 then collapsed 10+ packages with `*-core`/`*-excalibur`/`*-web` suffixes into the three packages described below.

## Workspace

| Path | Purpose |
|---|---|
| [`packages/engine`](packages/engine) | Excalibur-based engine + editor logic (Resources, Components, Systems, MapFormat) |
| [`packages/gjs`](packages/gjs) | GTK4/libadwaita widgets that host the engine + Gdk-side preview pipeline |
| [`apps/maker-gjs`](apps/maker-gjs) | The map editor application (primary) |
| [`apps/game-browser`](apps/game-browser) | Browser-runtime template — seed for multi-platform game export |
| [`apps/mcp-bridge`](apps/mcp-bridge) | Dev-only MCP↔D-Bus bridge for agent-driving the editor (`org.pixelrpg.maker.Control`) |
| [`apps/signalling-server`](apps/signalling-server) | Stateless WebSocket relay for cross-network WebRTC signalling |
| [`games/zelda-like`](games/zelda-like) | Sample game project used by the editor and storybook |
| [`games/blank-starter`](games/blank-starter) | Empty starter template ("New Project" opens it) |
| [`games/minimalist-starter`](games/minimalist-starter) | Minimal starter template |

The maker stays GJS-only. Exported games target multiple platforms — Browser is the first export target (`apps/game-browser` is the runtime seed).

## Quickstart

Prerequisites: [`@gjsify/cli`](https://github.com/gjsify/gjsify) (install with `curl -fsSL https://raw.githubusercontent.com/gjsify/gjsify/main/install.mjs | gjs -m -`) and a GNOME development environment with GJS, GTK 4, libadwaita, and `blueprint-compiler`. No Node or Yarn required.

```bash
git clone https://github.com/PixelRPG/map-editor.git
cd map-editor

gjsify install
gjsify run build
gjsify workspace @pixelrpg/maker-gjs start
```

## Development

```bash
gjsify foreach check -v -t                         # type-check all packages (topological)
gjsify foreach build -v -t                         # build all packages
gjsify workspace @pixelrpg/maker-gjs start         # run the editor
gjsify workspace @pixelrpg/gjs storybook           # run the widget storybook
gjsify workspace @pixelrpg/game-browser build      # build the browser-runtime template
gjsify fix                                         # format + safe-lint-fix (Biome via gjsify)
gjsify lint                                        # lint-only
gjsify foreach test -v -p --include @pixelrpg/engine   # engine unit tests (@gjsify/unit)
```

Per-package scripts use the same names: `build`, `check`, `start`. Run them with `gjsify run <script>` from within the package directory.

### Flatpak (`apps/maker-gjs`)

The manifest, MetaInfo and `.desktop` file are generated from `apps/maker-gjs/package.json#gjsify.flatpak`:

```bash
gjsify run flatpak:init     # regenerate manifest + AppStream assets
gjsify run flatpak:check    # appstreamcli + flatpak-builder-lint
gjsify run flatpak:build    # flatpak-builder + install + bundle .flatpak
```

For development conventions (commit style, ECS patterns, Blueprint UI, GTK4 lifecycle hooks), see [AGENTS.md](AGENTS.md).

## Stack

- [Excalibur.js](https://excaliburjs.com/) — game engine (ECS, TileMap, input)
- [GJS](https://gjs.guide/) — JavaScript bindings for GNOME
- [GTK 4](https://gtk.org/) + [libadwaita](https://gnome.pages.gitlab.gnome.org/libadwaita/) — desktop UI
- [Blueprint](https://jwestman.pages.gitlab.gnome.org/blueprint-compiler/) — declarative UI markup
- [gjsify](https://github.com/gjsify/gjsify) — full toolchain (builder, formatter, linter, package manager, Flatpak packaging, Node/Web/DOM APIs on GJS)

## License

See [LICENSE](LICENSE).
