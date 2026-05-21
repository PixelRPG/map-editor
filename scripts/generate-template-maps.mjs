#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Generates the starter map JSONs for the overworld / dungeon /
 * cozy-town templates from compact char-grid definitions in this file.
 *
 * Run manually after editing a grid:
 *
 *     node scripts/generate-template-maps.mjs
 *
 * Tile identities resolve via `games/_shared-minimalist/tileset.json`
 * — change the tileset (regenerate with `generate-minimalist-tileset.mjs`)
 * before tweaking the grids if you need a different palette.
 *
 * Each grid char maps to a tile name → the sprite-set's local index.
 * The maps reference the shared tileset via a relative path so all
 * three templates share one PNG.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const TILESET_JSON = resolve(ROOT, 'games', '_shared-minimalist', 'tileset.json')

const tileset = JSON.parse(readFileSync(TILESET_JSON, 'utf8'))
const tileIdByName = new Map(tileset.sprites.map((s) => [s.name.toLowerCase(), s.id]))

function id(name) {
  const v = tileIdByName.get(name.toLowerCase())
  if (v === undefined) throw new Error(`Unknown tile "${name}" — regenerate the tileset?`)
  return v
}

const SHARED_TILESET_REF = {
  id: 'shared-minimalist',
  path: '../../_shared-minimalist/tileset.json',
  type: 'spriteset',
  firstGid: 1,
}

/** Decompose a single-char glyph into (background tile, optional foreground tile). */
function glyphToTiles(ch) {
  // Lookup table for the chars used in the grids below.
  const map = {
    '.': ['grass'],
    G: ['grass', 'bush'],
    T: ['grass', 'tree'],
    f: ['grass', 'flower'],
    P: ['path'],
    p: ['path'],
    w: ['water'],
    W: ['deep water'],
    o: ['grass', 'pond'],
    s: ['sand'],
    S: ['stone'],
    X: ['wall'],
    t: ['stone', 'torch'],
    D: ['stone', 'door'],
    H: ['house wall'],
    R: ['house roof'],
    d: ['path', 'door'],
    C: ['stone', 'crystal'],
  }
  const names = map[ch]
  if (!names) throw new Error(`Unknown grid char "${ch}"`)
  return names.map(id)
}

/**
 * Build a `MapData`-shaped JSON from a char grid.
 *
 * Glyphs that resolve to two tiles produce sprites on two stacked
 * layers (background + foreground). One-tile glyphs only populate
 * the background. Output sprite IDs are local (0-based) within the
 * sprite-set — the engine adds `firstGid` itself when computing the
 * global tile id.
 */
function gridToMap({ id: mapId, name, grid }) {
  const rows = grid.length
  const cols = grid[0].length
  for (const r of grid) {
    if (r.length !== cols) throw new Error(`Row width mismatch in ${mapId}`)
  }

  const background = { id: 'layer-bg', name: 'Background', type: 'tile', visible: true, sprites: [] }
  const foreground = { id: 'layer-fg', name: 'Decorations', type: 'tile', visible: true, sprites: [] }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tiles = glyphToTiles(grid[y][x])
      background.sprites.push({ x, y, spriteId: tiles[0], spriteSetId: SHARED_TILESET_REF.id })
      if (tiles.length > 1) {
        foreground.sprites.push({ x, y, spriteId: tiles[1], spriteSetId: SHARED_TILESET_REF.id })
      }
    }
  }

  return {
    id: mapId,
    name,
    version: '1.0.0',
    // Sprite-set uses spriteWidth/spriteHeight; map uses tileWidth/tileHeight — same value.
    tileWidth: tileset.spriteWidth,
    tileHeight: tileset.spriteHeight,
    columns: cols,
    rows,
    spriteSets: [SHARED_TILESET_REF],
    layers: [background, foreground],
  }
}

const TEMPLATES = [
  {
    package: 'overworld-starter',
    mapId: 'overworld-scene',
    mapName: 'Open Field',
    // 24×16 — grass field with a winding path, small pond, scattered foliage.
    grid: [
      '........................',
      '..T.......G......T......',
      '.....f...........G......',
      '...T............T.......',
      '.........PP.............',
      '........PPPP............',
      '.......PP..PP...........',
      '......PP....PPPPP.......',
      '.f...PP.........PP......',
      '....PP...........PP.....',
      'wwwwP.G.....f.....PP....',
      'wWWP...............PP...',
      'wwwP.................P..',
      '..GP.T............G..P..',
      '...P.................P..',
      '...PPPPPPPPPPPPPPPPPPP..',
    ],
  },
  {
    package: 'dungeon-starter',
    mapId: 'dungeon-scene',
    mapName: 'Stone Chamber',
    // 20×14 — stone room enclosed by walls, central corridor, two torches, a door + crystal.
    grid: [
      'XXXXXXXXXXXXXXXXXXXX',
      'XSSSSSSSSSSSSSSSSSSX',
      'XStSSSSSSSSSSSSStSSX',
      'XSSSSSSSSSSSSSSSSSSX',
      'XSSSSSPPPPPPPPSSSSSX',
      'XSSSSSPSSSSSPSSSSSSX',
      'XSSSSSPSCSSPSSSSSSSX',
      'XSSSSSPSSSPSSSSSSSSX',
      'XSSSSSPPPPPSSSSSSSSX',
      'XSSSSSSSSSSSSSSSSSSX',
      'XStSSSSSSSSSSSSStSSX',
      'XSSSSSSSSSSSSSSSSSSX',
      'XXXXXXXXXdXXXXXXXXXX',
      'XXXXXXXXXXXXXXXXXXXX',
    ],
  },
  {
    package: 'cozy-town-starter',
    mapId: 'cozy-town-scene',
    mapName: 'Cozy Town Square',
    // 24×16 — grass town with a small house, a path running through, pond + decoration.
    grid: [
      '........................',
      '.....T..........T.......',
      '........................',
      '......RRRRRR............',
      '......HHHHHH............',
      '......HHHHHH............',
      '......HHdHHH............',
      '...PPPPPPPPPPPP.........',
      '...P..........P.........',
      '...P..f.......P.G.......',
      '...P..........P.........',
      '...P..........P....wwww.',
      '...P.G........P....wWWw.',
      '...P..........P....wwww.',
      '...PPPPPPPPPPPP.G.......',
      '........................',
    ],
  },
]

for (const tpl of TEMPLATES) {
  const mapData = gridToMap({ id: tpl.mapId, name: tpl.mapName, grid: tpl.grid })
  const outPath = resolve(ROOT, 'games', tpl.package, 'maps', `${tpl.mapId}.json`)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(mapData, null, 2)}\n`)
  console.log(`Wrote ${outPath} (${tpl.grid[0].length}×${tpl.grid.length}, ${mapData.layers.reduce((n, l) => n + l.sprites.length, 0)} sprites)`)
}
