# @pixelrpg/game-browser

Minimal browser host for a PixelRPG game project. Exists primarily to verify
that `@pixelrpg/engine-excalibur` still runs in a plain browser after the GJS
integration work — the map editor uses the same engine via a GTK widget, so
keeping a browser entry alive guards against accidental GJS-only regressions.

## Usage

```bash
yarn workspace @pixelrpg/game-browser build
yarn workspace @pixelrpg/game-browser start
```

`build` bundles `src/main.ts` via `gjsify build --app browser` into
`dist/main.js`. `start` serves `public/` (which includes the bundled
`main.js` once the build step is wired to copy it; see TODO below).

## Status

Scaffolding only. The engine boots against `<canvas id="game">` and loads
`games/zelda-like/game-project.json`, but the build pipeline still needs:

- copy `public/index.html` → `dist/index.html` as part of `build`
- resolve the `../games/zelda-like/...` asset path when served from `dist/`
  (likely via a dev-server rewrite or a `--public-dir` option on gjsify build)

Once those are in place, drop this section.
