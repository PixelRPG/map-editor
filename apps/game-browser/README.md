# @pixelrpg/game-browser

Minimal browser host for a PixelRPG game project. Exists to verify that
`@pixelrpg/engine-excalibur` still runs in a plain browser after the GJS
integration work — the map editor uses the same engine via a GTK widget, so
keeping a browser entry alive guards against accidental GJS-only regressions.

## Usage

```bash
yarn workspace @pixelrpg/game-browser build
yarn workspace @pixelrpg/game-browser start
```

- `build` runs `gjsify build --app browser` for `src/main.ts` into
  `dist/main.js`, then copies `public/index.html` into `dist/`.
- `start` serves the **repository root** via `http-server` and opens
  `/apps/game-browser/dist/index.html`. Serving from the repo root lets
  `/games/zelda-like/*` resolve without a separate asset server.

Open <http://127.0.0.1:8080/apps/game-browser/dist/index.html> to load
the zelda-like demo project against a full-viewport WebGL canvas.

## Not included

This app is deliberately a thin harness. It is **not** meant to be the
future game runtime — see `apps/maker-gjs` for the editor and treat this
as a smoke test.
