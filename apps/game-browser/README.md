# @pixelrpg/game-browser

Minimal browser host for a PixelRPG game project. Loads [`@pixelrpg/engine`](../../packages/engine) into a plain `<canvas>` and runs the same engine the GJS map editor uses — without any GTK / GJS dependencies.

This app is the **seed for multi-platform game export**: the long-term plan is for the editor to export playable games for multiple targets, with the browser being the first target. Keeping a working browser host here ensures the engine stays runtime-portable.

## Run

```bash
yarn workspace @pixelrpg/game-browser build
yarn workspace @pixelrpg/game-browser start
```

- `build` runs `gjsify build --app browser` for `src/main.ts` into `dist/main.js`, then copies `public/index.html` into `dist/`.
- `start` serves the **repository root** via `http-server` and opens `/apps/game-browser/dist/index.html`. Serving from the repo root lets `/games/zelda-like/*` resolve without a separate asset server.

Open <http://127.0.0.1:8080/apps/game-browser/dist/index.html> to load the zelda-like demo project against a full-viewport WebGL canvas.

## Scope

This app stays small. Editor-specific code (panels, tools, asset browser) lives in [`@pixelrpg/maker-gjs`](../maker-gjs). What ships here is just the runtime template that an exported game will be built on top of.
