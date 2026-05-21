#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Generates the minimalist-starter template's content:
 *   - 3 connected maps under `games/minimalist-starter/maps/`
 *   - the project's `game-project.json` (with the teleport list that
 *     stitches the maps together)
 *
 * Run manually after editing a grid or teleport list:
 *
 *     node scripts/generate-template-maps.mjs
 *
 * Tile identities resolve via the tileset JSON written by
 * `generate-minimalist-tileset.mjs` — regenerate that one first if
 * you've changed the tile palette.
 *
 * Compact char-grid descriptions live in this file; one grid per
 * scene. Glyphs resolve to (background tile, optional foreground tile)
 * pairs so a single grid covers both layers cleanly.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const TEMPLATE_DIR = resolve(ROOT, 'games', 'minimalist-starter')
const TILESET_JSON = resolve(TEMPLATE_DIR, 'spritesets', 'minimalist.json')

const tileset = JSON.parse(readFileSync(TILESET_JSON, 'utf8'))
const tileIdByName = new Map(tileset.sprites.map((s) => [s.name.toLowerCase(), s.id]))

function id(name) {
  const v = tileIdByName.get(name.toLowerCase())
  if (v === undefined) throw new Error(`Unknown tile "${name}" — regenerate the tileset?`)
  return v
}

const TILESET_REF = {
  id: 'minimalist',
  path: '../spritesets/minimalist.json',
  type: 'spriteset',
  firstGid: 1,
}

/** Single-char glyph → (background, optional foreground) tile name(s). */
function glyphToTiles(ch) {
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

/** Convert a char-grid scene definition into a `MapData`-shaped JSON. */
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
      background.sprites.push({ x, y, spriteId: tiles[0], spriteSetId: TILESET_REF.id })
      if (tiles.length > 1) {
        foreground.sprites.push({ x, y, spriteId: tiles[1], spriteSetId: TILESET_REF.id })
      }
    }
  }

  return {
    id: mapId,
    name,
    version: '1.0.0',
    tileWidth: tileset.spriteWidth,
    tileHeight: tileset.spriteHeight,
    columns: cols,
    rows,
    spriteSets: [TILESET_REF],
    layers: [background, foreground],
  }
}

const SCENES = [
  {
    id: 'overworld',
    name: 'Open Field',
    atlasX: 30,
    atlasY: 40,
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
    id: 'dungeon',
    name: 'Stone Chamber',
    atlasX: 320,
    atlasY: 40,
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
    id: 'cozy-town',
    name: 'Cozy Town Square',
    atlasX: 30,
    atlasY: 320,
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

/**
 * Teleport spots stitching the three scenes together. Coordinates are
 * (col, row) on the **source** scene's tile grid; the editor's atlas
 * view picks them up via the project loader and draws the dashed
 * bezier overlay.
 *
 * Engine-side execution (i.e. actually warping the player) is a
 * deferred TODO — see `TODO.md` § Engine / runtime.
 */
const TELEPORTS = [
  {
    id: 'overworld-to-dungeon',
    label: 'Cave Entrance',
    from: { mapId: 'overworld', x: 13, y: 7 },
    to:   { mapId: 'dungeon',   x: 9,  y: 12 },
  },
  {
    id: 'dungeon-to-overworld',
    label: 'Exit',
    from: { mapId: 'dungeon',   x: 9,  y: 12 },
    to:   { mapId: 'overworld', x: 13, y: 7 },
  },
  {
    id: 'overworld-to-town',
    label: 'Town Path',
    from: { mapId: 'overworld', x: 21, y: 15 },
    to:   { mapId: 'cozy-town', x: 3,  y: 7 },
  },
  {
    id: 'town-to-overworld',
    label: 'Open Field',
    from: { mapId: 'cozy-town', x: 3,  y: 7 },
    to:   { mapId: 'overworld', x: 21, y: 15 },
  },
]

// --- Write the three map JSONs ----------------------------------------------
const mapsDir = resolve(TEMPLATE_DIR, 'maps')
mkdirSync(mapsDir, { recursive: true })

for (const scene of SCENES) {
  const mapData = gridToMap({ id: scene.id, name: scene.name, grid: scene.grid })
  // Stash the atlas-space coordinates the maker uses to lay the cards
  // out. The engine ignores `editorData`; this just round-trips with
  // the format so dragging cards in the atlas can persist later.
  mapData.editorData = { atlasX: scene.atlasX, atlasY: scene.atlasY }
  const outPath = resolve(mapsDir, `${scene.id}.json`)
  writeFileSync(outPath, `${JSON.stringify(mapData, null, 2)}\n`)
  console.log(`Wrote ${outPath} (${scene.grid[0].length}×${scene.grid.length}, ${mapData.layers.reduce((n, l) => n + l.sprites.length, 0)} sprites)`)
}

// --- Write the project file --------------------------------------------------
const project = {
  version: '1.0.0',
  id: 'minimalist-starter',
  name: 'Minimalist Starter',
  startup: {
    initialMapId: SCENES[0].id,
    initialX: 0,
    initialY: 0,
    initialDirection: 'down',
  },
  maps: SCENES.map((s) => ({
    id: s.id,
    name: s.name,
    path: `./maps/${s.id}.json`,
    type: 'map',
    category: s.id === 'dungeon' ? 'dungeon' : s.id === 'cozy-town' ? 'town' : 'overworld',
  })),
  mapCategories: [
    { id: 'overworld', name: 'Overworld' },
    { id: 'dungeon',   name: 'Dungeon' },
    { id: 'town',      name: 'Town' },
  ],
  spriteSets: [
    {
      id: 'minimalist',
      path: './spritesets/minimalist.json',
      type: 'spriteset',
      category: 'tiles',
    },
  ],
  teleports: TELEPORTS,
  properties: {
    gameTitle: 'Minimalist Starter',
    author: '',
    version: '0.1.0',
    description: 'Three connected scenes (overworld · dungeon · cozy town) built from a shared minimalist tileset.',
    defaultTileSize: tileset.spriteWidth,
  },
  editorData: {
    template: 'minimalist-starter',
  },
}

const projectPath = resolve(TEMPLATE_DIR, 'game-project.json')
writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`)
console.log(`Wrote ${projectPath} (${SCENES.length} maps, ${TELEPORTS.length} teleports)`)
