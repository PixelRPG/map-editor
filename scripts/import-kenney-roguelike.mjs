#!/usr/bin/env -S node --experimental-transform-types
/**
 * Import Kenney's Roguelike/RPG pack into `games/blank-starter`.
 *
 * One-shot, re-runnable: it rewrites `spritesets/roguelike.{png,json}`,
 * `spritesets/roguelike.LICENSE.txt` and the grass fill of
 * `maps/blank-scene.json` from scratch every run, so a correction to a
 * table below is applied by running it again rather than by hand-editing
 * 1767 sprite entries. Registering the set in `game-project.json` is the
 * one step left to a human — it is three lines and it is project policy,
 * not pack data.
 *
 * Run it against an unpacked copy of the pack (the ZIP from
 * <https://opengameart.org/content/roguelike-pack>):
 *
 *     ./scripts/import-kenney-roguelike.mjs /path/to/unpacked-pack
 *
 * Through the shebang, not `node scripts/…`: the flag it carries is
 * `--experimental-transform-types` rather than plain type stripping,
 * because this imports `TerrainPreset`, which is a real enum, and plain
 * `node` refuses it.
 *
 * The directory is read-only input and is never executed from — the
 * pack is third-party data.
 *
 * The terrain tables are NOT written out cell by cell. The script places
 * a layout preset (`resource/terrain-presets.ts`) at the measured
 * origin and lets `terrainTilesForPreset` derive the mask → sprite-id
 * table, which is the same code path the definition dialog will use —
 * so a bug in the presets fails here too instead of being papered over
 * by hand-copied numbers. Coordinates are measured in
 * `docs/design/ui-redesign/TERRAIN.md` § 2.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { defaultTerrainLayout, terrainTilesForPreset } from '../packages/engine/src/resource/terrain-presets.ts'
import { TerrainPreset } from '../packages/engine/src/types/data/TerrainData.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GAME = join(ROOT, 'games/blank-starter')

/** Geometry of `roguelikeSheet_transparent.png`, measured (§ 2). */
const SHEET = { columns: 57, rows: 31, tile: 16, spacing: 1, margin: 0 }

/** Where the pack came from, for the licence sidecar. */
const SOURCE_URL = 'https://opengameart.org/content/roguelike-pack'
const RETRIEVED = '2026-11-16'

/** `row * columns + col` — the id rule every sheet in this repo uses. */
const idOf = (col, row) => row * SHEET.columns + col

/** Inclusive rectangle → the cells inside it. */
function cellsOf([c0, r0, c1, r1]) {
  const cells = []
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) cells.push([col, row])
  return cells
}

// ---------------------------------------------------------------------------
// The pack's own PNG, decoded here
// ---------------------------------------------------------------------------

/**
 * Alpha channel of an 8-bit RGBA, non-interlaced PNG.
 *
 * Decoded rather than read through a library because the two facts the
 * import needs are both alpha-only — whether a cell is blank, and
 * whether a terrain's edge pieces are cut out (§ 5.2) — and the
 * workspace has no image decoder outside GJS/GDK, which this script
 * cannot reach. Narrow on purpose: anything but the pack's own format
 * throws rather than guessing.
 */
function decodeAlpha(pngPath) {
  const png = readFileSync(pngPath)
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error(`${pngPath}: not a PNG`)

  let width = 0
  let height = 0
  const idat = []
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at)
    const type = png.toString('latin1', at + 4, at + 8)
    const body = png.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const [depth, colour, , , interlace] = [body[8], body[9], body[10], body[11], body[12]]
      if (depth !== 8 || colour !== 6 || interlace !== 0) {
        throw new Error(`${pngPath}: expected 8-bit RGBA, non-interlaced (got depth ${depth}, colour ${colour})`)
      }
    } else if (type === 'IDAT') idat.push(body)
    else if (type === 'IEND') break
    at += 12 + length
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const pixels = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const c = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0
      let value = line[x]
      if (filter === 1) value += a
      else if (filter === 2) value += b
      else if (filter === 3) value += (a + b) >> 1
      else if (filter === 4) value += paeth(a, b, c)
      else if (filter !== 0) throw new Error(`${pngPath}: unknown row filter ${filter}`)
      pixels[y * stride + x] = value & 0xff
    }
  }

  const alpha = new Uint8Array(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3]
  return { width, height, alpha }
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** Alpha of every pixel of one cell, honouring margin and spacing. */
function cellAlpha(image, col, row) {
  const x0 = SHEET.margin + col * (SHEET.tile + SHEET.spacing)
  const y0 = SHEET.margin + row * (SHEET.tile + SHEET.spacing)
  const out = []
  for (let y = y0; y < y0 + SHEET.tile; y++) {
    for (let x = x0; x < x0 + SHEET.tile; x++) out.push(image.alpha[y * image.width + x])
  }
  return out
}

// ---------------------------------------------------------------------------
// What the pack holds — measured, not guessed (TERRAIN.md § 2, § 6.5, § 7.2)
// ---------------------------------------------------------------------------

/**
 * The brushes the starter ships (§ 8.1, § 2.2, § 2.3). `origin` is the top-left
 * of the preset's FIRST part in the sheet; `parts` nudges a part that
 * sits somewhere else — only water needs it, its inner corners being
 * one row below everyone else's (§ 2.2).
 *
 * `members` are sprites that COUNT as the terrain without ever being
 * picked: plain water, pixel-identical to the block centre.
 */
const TERRAINS = [
  { id: 'path', name: 'Path', preset: TerrainPreset.Ground29, origin: [5, 7], surface: 'dirt' },
  { id: 'stone', name: 'Stone', preset: TerrainPreset.Ground29, origin: [5, 13], surface: 'stone' },
  { id: 'sand', name: 'Sand', preset: TerrainPreset.Ground29, origin: [5, 19], surface: 'sand' },
  {
    id: 'water',
    name: 'Water',
    preset: TerrainPreset.Patch13,
    origin: [2, 0],
    parts: { corners: { col: 0, row: 1 } },
    members: [
      [0, 0],
      [1, 0],
    ],
    surface: 'water',
    solid: true,
  },
  { id: 'grass', name: 'Grass', preset: TerrainPreset.Patch13, origin: [2, 15], surface: 'grass' },
  { id: 'autumn-leaves', name: 'Autumn leaves', preset: TerrainPreset.Patch13, origin: [2, 18], surface: 'grass' },
  { id: 'purple-leaves', name: 'Purple leaves', preset: TerrainPreset.Patch13, origin: [2, 21], surface: 'grass' },
  // Flower beds: a low stone wall round the flowers. Their rim tiles are
  // solid (see BED_WALLS below), the flowers inside are not.
  { id: 'bed-red', name: 'Red flower bed', preset: TerrainPreset.Patch13, origin: [2, 6], surface: 'grass' },
  { id: 'bed-white', name: 'White flower bed', preset: TerrainPreset.Patch13, origin: [2, 9], surface: 'grass' },
  { id: 'bed-blue', name: 'Blue flower bed', preset: TerrainPreset.Patch13, origin: [2, 12], surface: 'grass' },
  // The stone-rimmed pool: already solid through SOLID.
  { id: 'pool', name: 'Pool', preset: TerrainPreset.Patch13, origin: [2, 3], surface: 'water' },
  // Rugs and carpets: one plain 3×3 block each, walkable.
  { id: 'rug-teal', name: 'Teal rug', preset: TerrainPreset.Block9, origin: [10, 7] },
  { id: 'rug-green', name: 'Green rug', preset: TerrainPreset.Block9, origin: [10, 10] },
  { id: 'rug-orange', name: 'Orange rug', preset: TerrainPreset.Block9, origin: [10, 13] },
  { id: 'carpet-green', name: 'Green carpet', preset: TerrainPreset.Block9, origin: [10, 16] },
  { id: 'carpet-orange', name: 'Orange carpet', preset: TerrainPreset.Block9, origin: [10, 19] },
  { id: 'carpet-teal', name: 'Teal carpet', preset: TerrainPreset.Block9, origin: [10, 22] },
]

/**
 * The wall round each flower bed: the 3×3 block minus its centre, and
 * the 2×2 of inner corners, whose grey corner stones are wall too. Rows
 * are the first row of each bed (red, white, blue).
 */
const BED_WALLS = [6, 9, 12].flatMap((row) => [
  [2, row, 4, row + 2],
  [0, row, 1, row + 1],
])
const BED_FREE = [6, 9, 12].map((row) => [3, row + 1, 3, row + 1])

/** The plain floor tiles, coarse and fine speckle of each (§ 2.4). */
const FILLS = [
  {
    name: 'Grass',
    surface: 'grass',
    tags: ['floor', 'grass'],
    cells: [
      [5, 0],
      [5, 1],
    ],
  },
  {
    name: 'Dirt',
    surface: 'dirt',
    tags: ['floor', 'dirt'],
    cells: [
      [6, 0],
      [6, 1],
    ],
  },
  {
    name: 'Stone',
    surface: 'stone',
    tags: ['floor', 'stone'],
    cells: [
      [7, 0],
      [7, 1],
    ],
  },
  {
    name: 'Sand',
    surface: 'sand',
    tags: ['floor', 'sand'],
    cells: [
      [8, 0],
      [8, 1],
    ],
  },
]

/**
 * The § 6.5 list: the handful of things a beginner looks for by name.
 * Every cell of a rect gets the SAME name and tags, so searching
 * "tree" returns the whole group rather than one arbitrary quarter of
 * one tree. Naming all 1767 tiles is explicitly not the goal.
 */
const NAMED = [
  {
    name: 'Tree',
    tags: ['nature', 'tree'],
    rects: [
      [13, 9, 18, 11],
      [23, 9, 23, 11],
      [27, 9, 27, 11],
    ],
  },
  {
    name: 'Bush',
    tags: ['nature', 'bush'],
    rects: [
      [19, 9, 22, 11],
      [24, 9, 26, 11],
    ],
  },
  { name: 'Sign', tags: ['prop', 'sign'], rects: [[19, 0, 22, 0]] },
  { name: 'House', tags: ['building', 'house'], rects: [[13, 12, 40, 24]] },
  { name: 'Door', tags: ['building', 'door'], rects: [[40, 7, 47, 7]] },
  { name: 'Chest', tags: ['prop', 'chest'], rects: [[38, 9, 39, 11]] },
  { name: 'Fence', tags: ['prop', 'fence'], rects: [[45, 23, 53, 24]] },
]

/**
 * What blocks movement (§ 7.2). Solidity is written as `solid: true`
 * and nothing else: `isSpriteRefSolid` reads `solid` before
 * `tileProperties.walkable`, so writing both would be two spellings of
 * one fact that can disagree. `false` is never written — absent means
 * free, which is what the only other committed tileset does.
 *
 * Free by default and therefore absent from this table: the doors
 * (40–47, 7), the dark arches below them, the mine rails (41–48,
 * 18–22), the loose items of rows 15–17 and rows 25–30, which are UI
 * nine-slice panels rather than map tiles.
 */
const SOLID = [
  [0, 3, 4, 5], // rimmed pool
  [10, 0, 12, 6], // shop fronts
  [13, 0, 37, 8], // furniture
  [38, 0, 39, 8], // cupboards
  [40, 0, 48, 6], // windows
  [44, 8, 48, 9], // coffins
  [38, 9, 39, 11], // chests
  [13, 9, 18, 11], // trees
  [19, 9, 26, 11], // bushes and hedges
  [27, 9, 27, 11], // tree
  [23, 9, 23, 11], // tree
  [46, 10, 48, 11], // tents
  [49, 0, 53, 8], // banners
  [54, 0, 56, 5], // curtains
  [54, 6, 55, 10], // fireplaces
  [49, 9, 53, 11], // gravestones
  [13, 12, 40, 24], // house walls and roofs
  [41, 12, 48, 14], // bookshelves
  [49, 12, 50, 14], // bookshelves
  [51, 12, 53, 14], // hanging nets
  [49, 18, 52, 22], // minecarts
  [45, 23, 53, 24], // fences
  [54, 19, 56, 24], // rock and dirt piles
  ...BED_WALLS, // flower-bed rims
]

/**
 * Holes punched back out of {@link SOLID} — the doorway arches along
 * the bottom of the house block, which sit inside the house rect but
 * are the one place the player walks through it.
 */
const FREE = [
  [17, 17, 19, 17],
  [24, 17, 26, 17],
  [31, 17, 33, 17],
  [38, 17, 40, 17],
  ...BED_FREE, // the flowers inside a bed
]

/**
 * The tile `maps/blank-scene.json` is filled with (§ 8.1), and the
 * ground this sheet's brushes are drawn on (`floorSpriteId`): plain
 * grass. Without it the editor takes the sheet's first opaque tile,
 * which here is water — and a water brush on water shows no shore.
 */
const START_FILL = [5, 0]

// ---------------------------------------------------------------------------
// Build the descriptor
// ---------------------------------------------------------------------------

function buildTerrains(image) {
  return TERRAINS.map((terrain) => {
    const layout = defaultTerrainLayout(terrain.preset, terrain.origin[0], terrain.origin[1])
    const parts = { ...layout.parts, ...(terrain.parts ?? {}) }
    const tiles = terrainTilesForPreset(terrain.preset, parts, SHEET)
    const expected = { [TerrainPreset.Ground29]: 29, [TerrainPreset.Patch13]: 13, [TerrainPreset.Block9]: 9 }[
      terrain.preset
    ]
    if (Object.keys(tiles).length !== expected) {
      throw new Error(`terrain ${terrain.id}: ${Object.keys(tiles).length} tiles, expected ${expected}`)
    }
    const data = { id: terrain.id, name: terrain.name, tiles }
    if (terrain.members) data.members = terrain.members.map(([col, row]) => idOf(col, row))
    if (isOverlay(image, tiles)) data.overlay = true
    data.layout = { preset: terrain.preset, parts }
    return data
  })
}

/**
 * § 5.2, derived rather than asked: the filled centre is fully opaque
 * and some other piece is cut out, so painting the terrain alone would
 * show the background through its edges — it has to keep the floor
 * under it instead.
 */
function isOverlay(image, tiles) {
  const centre = tiles['255']
  if (centre === undefined) return false
  const transparent = (id) => cellAlpha(image, id % SHEET.columns, Math.floor(id / SHEET.columns)).some((a) => a === 0)
  if (transparent(centre)) return false
  return Object.values(tiles).some((id) => id !== centre && transparent(id))
}

function buildSprites(image, terrains) {
  const sprites = []
  const blank = new Set()
  for (let row = 0; row < SHEET.rows; row++) {
    for (let col = 0; col < SHEET.columns; col++) {
      const id = idOf(col, row)
      sprites[id] = { id, col, row }
      if (cellAlpha(image, col, row).every((a) => a === 0)) blank.add(id)
    }
  }

  /** A blank cell is a gap in the sheet, not a wall and not a thing. */
  const describe = (id, patch) => {
    if (blank.has(id)) return
    Object.assign(sprites[id], patch)
  }
  const surfaceOf = (id, surface) => {
    if (blank.has(id)) return
    sprites[id].tileProperties = { ...sprites[id].tileProperties, surface }
  }

  for (const rect of SOLID) for (const [col, row] of cellsOf(rect)) describe(idOf(col, row), { solid: true })
  for (const rect of FREE) {
    for (const [col, row] of cellsOf(rect)) delete sprites[idOf(col, row)].solid
  }

  for (const fill of FILLS) {
    for (const [col, row] of fill.cells) {
      describe(idOf(col, row), { name: fill.name, tags: fill.tags })
      surfaceOf(idOf(col, row), fill.surface)
    }
  }

  for (const group of NAMED) {
    for (const rect of group.rects) {
      for (const [col, row] of cellsOf(rect)) describe(idOf(col, row), { name: group.name, tags: group.tags })
    }
  }

  // Terrains last: their name, surface and wall flag are the authority
  // for the cells they own, whatever a rect above said.
  for (const spec of TERRAINS) {
    const data = terrains.find((t) => t.id === spec.id)
    for (const id of [...Object.values(data.tiles), ...(data.members ?? [])]) {
      describe(id, { name: spec.name, tags: ['terrain', spec.id] })
      if (spec.surface) surfaceOf(id, spec.surface)
      if (spec.solid) describe(id, { solid: true })
    }
  }

  // Field order matching the sprite sets already in the repo.
  return sprites.map((sprite) => {
    const { id, col, row, name, tags, solid, tileProperties } = sprite
    const out = { id, col, row }
    if (name !== undefined) out.name = name
    if (tags !== undefined) out.tags = tags
    if (solid !== undefined) out.solid = solid
    if (tileProperties !== undefined) out.tileProperties = tileProperties
    return out
  })
}

function licenceText(packDir) {
  const upstream = readFileSync(join(packDir, 'License.txt'), 'utf8').trimEnd()
  return [
    'Roguelike/RPG pack — the licence shipped with the pack, verbatim:',
    '',
    upstream,
    '',
    '-'.repeat(79),
    '',
    `Source:    ${SOURCE_URL}`,
    `Retrieved: ${RETRIEVED}`,
    'File:      Spritesheet/roguelikeSheet_transparent.png, copied unmodified',
    '',
    'CC0 requires no credit. PixelRPG credits Kenney in the About dialog of',
    'the editor anyway.',
    '',
  ].join('\n')
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

// ---------------------------------------------------------------------------

function main() {
  const packDir = process.argv[2]
  if (!packDir) {
    console.error('usage: import-kenney-roguelike.mjs <unpacked-roguelike-pack-dir>')
    process.exit(2)
  }

  const sheetPath = join(packDir, 'Spritesheet/roguelikeSheet_transparent.png')
  const image = decodeAlpha(sheetPath)
  const expectedWidth = SHEET.margin * 2 + SHEET.columns * (SHEET.tile + SHEET.spacing) - SHEET.spacing
  const expectedHeight = SHEET.margin * 2 + SHEET.rows * (SHEET.tile + SHEET.spacing) - SHEET.spacing
  if (image.width !== expectedWidth || image.height !== expectedHeight) {
    throw new Error(`${sheetPath}: ${image.width}×${image.height}, expected ${expectedWidth}×${expectedHeight}`)
  }

  const terrains = buildTerrains(image)
  const sprites = buildSprites(image, terrains)

  copyFileSync(sheetPath, join(GAME, 'spritesets/roguelike.png'))
  writeFileSync(join(GAME, 'spritesets/roguelike.LICENSE.txt'), licenceText(packDir))
  writeJson(join(GAME, 'spritesets/roguelike.json'), {
    version: '1.0.0',
    id: 'roguelike',
    name: 'Roguelike',
    kind: 'tileset',
    image: { id: 'main', path: 'roguelike.png', type: 'image' },
    spriteWidth: SHEET.tile,
    spriteHeight: SHEET.tile,
    columns: SHEET.columns,
    rows: SHEET.rows,
    margin: SHEET.margin,
    spacing: SHEET.spacing,
    sprites,
    terrains,
    floorSpriteId: idOf(START_FILL[0], START_FILL[1]),
    properties: {
      author: 'Kenney Vleugels for Kenney (www.kenney.nl)',
      license: 'CC0-1.0',
      licenseFile: 'roguelike.LICENSE.txt',
      source: SOURCE_URL,
    },
  })

  const mapPath = join(GAME, 'maps/blank-scene.json')
  const map = JSON.parse(readFileSync(mapPath, 'utf8'))
  map.spriteSets = [{ id: 'roguelike', path: '../spritesets/roguelike.json', type: 'spriteset', firstGid: 1 }]
  const fill = []
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.columns; x++) {
      fill.push({ x, y, spriteId: idOf(START_FILL[0], START_FILL[1]), spriteSetId: 'roguelike' })
    }
  }
  map.layers[0].sprites = fill
  writeJson(mapPath, map)

  const overlay = terrains.filter((t) => t.overlay).map((t) => t.id)
  console.log(`${sprites.length} sprites, ${terrains.length} terrains (overlay: ${overlay.join(', ') || 'none'})`)
  console.log(`${sprites.filter((s) => s.solid).length} solid, ${sprites.filter((s) => s.name).length} named`)
  console.log(`${fill.length} tiles of grass in ${mapPath}`)
}

main()
