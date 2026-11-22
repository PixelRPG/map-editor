# Fusion Pixel Font (12 px proportional, Latin subset)

The engine's built-in default font, not a per-project asset. It lives here, next to the engine that hard-wires its metrics (`DEFAULT_FONT_ID`), and each app reaches it from this one copy:

- **maker-gjs**: `gjsify.ship.fonts` installs the TTF into `share/fonts/<appId>/` (fontconfig); `ship.extraFiles` installs the licence texts. The credit is in the About dialog.
- **game-browser**: `build:static` copies this directory to `dist/fonts/fusion-pixel/`; the credit is the footer link in `index.html`.

A project can override the font later through the font chain (`DEFAULT_FONT_CHAINS`).

- Source: https://github.com/TakWolf/fusion-pixel-font, release 2026.11.10, `fusion-pixel-font-12px-proportional-ttf`.
- Authors: TakWolf; glyphs built on Ark Pixel Font (see `OFL-ark-pixel.txt`), with Cubic 11 and Galmuri.
- Licence: SIL OFL 1.1 (`OFL.txt`). The release declares no Reserved Font Name, so the subset keeps the original name.
- Shipped file: `fusion-pixel-12px-proportional-latin-subset.ttf` — 333 glyphs (Latin-1, Latin Extended-A, typographic punctuation, arrows, and every character of the German catalogue and the example games), 35 KB. The full `latin` file is 7.3 MB and has 37 647 glyphs.
- Rebuild: `python3 -I scripts/fonts/build-fusion-pixel.py <extracted-release-dir> .` (also regenerates the advance table `packages/engine/src/services/fusion-pixel-12-metrics.ts`).

## Adding a full per-language font

Ship the release's `-zh_hans` / `-ja` / `-ko` / … TTF (about 7 MB each) as its own font id, and map the language to it in `DEFAULT_FONT_CHAINS` (`packages/engine/src/services/font-chain.ts`); the default font stays last in the chain. Add a metrics table for it the same way as `fusion-pixel-12-metrics.ts`.
