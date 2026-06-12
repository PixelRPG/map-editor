# Credits

This is a **non-commercial, educational fan project** (see
[LICENSE.md](LICENSE.md) — same terms as `games/zelda-like`). It exists
as a browsable reference world for the PixelRPG editor; fix-ups and
curation happen here before content graduates into a real game.

## Source material

- **The Legend of Zelda™: Ocarina of Time** — original game, characters,
  locations and all related trademarks are the property of **Nintendo**.
  This project is unofficial and is **not affiliated with or endorsed by
  Nintendo** in any way.

## Ported maps & tilesets — full provenance

- **All 19 maps and their tilesets** — converted 1:1 from
  **The Legend of Zelda: Ocarina of Time 2D** v0.10.2 by
  **CheerfulSage & GodsTurf** ([oot-2d.com](http://www.oot-2d.com/), 2014):
  the `Maps/*.zmap` + `Tiles/*.png` files of the Windows build archived as
  `the-legend-of-zelda-ocarina-of-time-2d-0-10-2-en-win.zip` in the
  [PixelRPG/oot-2d](https://github.com/PixelRPG/oot-2d) reference repo.
  Conversion: `tools/export-pixelrpg-maps.py` (same repo), built on the
  `.zmap` parser [fluxcompile/oot2d-map](https://github.com/fluxcompile/oot2d-map).
  Each map's `properties.source` records its exact origin file.
  Visual references: `tools/export-maps.py` renders (`ExportedMaps/`).
  Note: the 2014 game uses **8px tiles**; no solidity data exists in the
  `.zmap` format, so collision flags must be authored in the editor.
- **Link character sprites** — same recomposition as `games/zelda-like`
  (OoT 2D 2014 `Graphics/Link.png`, oot-2d.com team).

## How to credit additions

When you port further assets or maps into this project, add an entry
here **in the same commit** — source project, author, link, and which
files were derived from it.
