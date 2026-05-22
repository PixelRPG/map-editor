#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Generates the minimalist-starter template's tileset:
 *   `games/minimalist-starter/spritesets/minimalist.{png,json}`
 *
 * Run manually (once) when the tile spec changes:
 *
 *     node scripts/generate-minimalist-tileset.mjs
 *
 * Produces a 64×64 PNG holding a 4×4 grid of 16×16 tiles plus the
 * matching sprite-set JSON consumed by `@pixelrpg/engine`'s
 * `GameProjectResource`. Pure-Node — uses only built-in `zlib` + `fs`
 * so no extra workspace dependency.
 *
 * The minimalist-starter template uses this tileset across all of its
 * scenes (overworld / dungeon / cozy town) — the goal is one
 * recognisable starter that demos multi-map + teleport editing
 * without commissioning per-scene art.
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(__dirname, '..', 'games', 'minimalist-starter', 'spritesets')
const TILE_SIZE = 16
const COLUMNS = 4
const ROWS = 4
const TILE_COUNT = COLUMNS * ROWS
const SHEET_W = TILE_SIZE * COLUMNS
const SHEET_H = TILE_SIZE * ROWS

/** Decode `#rrggbb` (or `#rgb`) into `[r, g, b]`. */
function hex(h) {
  let s = h.replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}

/**
 * A single tile descriptor.
 *
 * `base` fills the entire 16×16 cell. `detail` may add per-pixel
 * overlays (an array of `{ x, y, color }`, both coords 0..15). Use
 * `darken` / `lighten` for shading.
 */
// `tileProperties` rides along with each entry so the generator
// emits the new sprite-data schema directly. See
// `docs/concepts/object-system.md` § "Tile properties live on the
// sprite".
const TILES = [
  // Row 0 — overworld foliage / earth
  { id: 'grass',      name: 'Grass',        base: '#5fb04c', detail: scatter(8, '#6cc457', '#4d9b3a', 0x42),
    tileProperties: { surface: 'grass' } },
  { id: 'tree',       name: 'Tree',         base: '#2d6a25', detail: blob('#3b8f30', 4)    .concat(blob('#1c4517', 1)),
    tileProperties: { walkable: false, surface: 'wood' } },
  { id: 'flower',     name: 'Flower',       base: '#5fb04c', detail: scatter(4, '#f0a85c', '#e056fd', 0x77).concat(scatter(2, '#ffffff', '#ffd166', 0x33)),
    tileProperties: { surface: 'grass' } },
  { id: 'bush',       name: 'Bush',         base: '#5fb04c', detail: roundish('#3d6b3a', 6).concat(roundish('#2d4b2a', 2)),
    tileProperties: { walkable: false, surface: 'wood' } },

  // Row 1 — water + sand
  { id: 'water',      name: 'Water',        base: '#5db9d6', detail: scatter(6, '#7ed1e6', '#4198b0', 0x55).concat(stripes('#9adfee', 3, 4)),
    tileProperties: { walkable: false, surface: 'water' } },
  { id: 'deep-water', name: 'Deep Water',   base: '#2b6783', detail: scatter(4, '#3d8aab', '#1d4659', 0x33).concat(stripes('#5da6c7', 2, 5)),
    tileProperties: { walkable: false, surface: 'water' } },
  { id: 'sand',       name: 'Sand',         base: '#f0d995', detail: scatter(6, '#ecca6d', '#d6b562', 0x55),
    tileProperties: { surface: 'sand' } },
  { id: 'pond',       name: 'Pond',         base: '#5fb04c', detail: roundish('#5db9d6', 8).concat(roundish('#7ed1e6', 4)),
    tileProperties: { walkable: false, surface: 'water' } },

  // Row 2 — paths / stone / dungeon
  { id: 'path',       name: 'Path',         base: '#c6a576', detail: scatter(6, '#d6b58a', '#a8895f', 0x44),
    tileProperties: { surface: 'sand' } },
  { id: 'stone',      name: 'Stone',        base: '#6a6a6f', detail: scatter(6, '#7c7c81', '#535358', 0x55),
    tileProperties: { surface: 'stone' } },
  { id: 'wall',       name: 'Wall',         base: '#4a4a4f', detail: stripes('#5a5a5f', 2, 4).concat(stripes('#3a3a3f', 1, 8)),
    tileProperties: { walkable: false, surface: 'stone' } },
  { id: 'door',       name: 'Door',         base: '#4a2e1e', detail: stripes('#5e3a25', 1, 5).concat([{ x: 12, y: 8, color: '#ffd166' }]),
    tileProperties: { surface: 'wood' } },

  // Row 3 — town / accents
  { id: 'house-wall', name: 'House Wall',   base: '#8b6240', detail: bricks('#7a5536', '#9a6f4a') },
  { id: 'house-roof', name: 'House Roof',   base: '#8b3a3a', detail: stripes('#a04646', 2, 3).concat(stripes('#6f2c2c', 1, 6)) },
  { id: 'torch',      name: 'Torch',        base: '#4a2e1e', detail: [
    { x: 7, y: 1, color: '#ffd166' }, { x: 8, y: 1, color: '#ffd166' },
    { x: 6, y: 2, color: '#f0a85c' }, { x: 7, y: 2, color: '#fff5d6' },
    { x: 8, y: 2, color: '#fff5d6' }, { x: 9, y: 2, color: '#f0a85c' },
    { x: 7, y: 3, color: '#f0a85c' }, { x: 8, y: 3, color: '#f0a85c' },
  ] },
  { id: 'crystal',    name: 'Crystal',      base: '#2d6a25', detail: [
    { x: 7, y: 4, color: '#7ed6df' }, { x: 8, y: 4, color: '#7ed6df' },
    { x: 6, y: 5, color: '#5fb6c9' }, { x: 7, y: 5, color: '#cef5fa' }, { x: 8, y: 5, color: '#cef5fa' }, { x: 9, y: 5, color: '#5fb6c9' },
    { x: 6, y: 6, color: '#5fb6c9' }, { x: 7, y: 6, color: '#7ed6df' }, { x: 8, y: 6, color: '#7ed6df' }, { x: 9, y: 6, color: '#5fb6c9' },
    { x: 7, y: 7, color: '#5fb6c9' }, { x: 8, y: 7, color: '#5fb6c9' },
  ] },
]

/** Deterministic scatter of `count` dots across the tile. */
function scatter(count, lightColor, darkColor, seed) {
  const out = []
  let n = seed
  for (let i = 0; i < count; i++) {
    n = (n * 1103515245 + 12345) & 0x7fffffff
    const x = n % TILE_SIZE
    n = (n * 1103515245 + 12345) & 0x7fffffff
    const y = n % TILE_SIZE
    out.push({ x, y, color: i % 2 === 0 ? lightColor : darkColor })
  }
  return out
}

/** Small roughly-round shape centred on the tile, radius ≈ `r`. */
function roundish(color, r) {
  const out = []
  const cx = TILE_SIZE / 2 - 0.5
  const cy = TILE_SIZE / 2 - 0.5
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r * r) out.push({ x, y, color })
    }
  }
  return out
}

/** Filled square `radius`×`radius`-ish around centre. */
function blob(color, radius) {
  const out = []
  const cx = TILE_SIZE / 2
  const cy = TILE_SIZE / 2
  for (let y = cy - radius; y < cy + radius; y++) {
    for (let x = cx - radius; x < cx + radius; x++) {
      if (x >= 0 && y >= 0 && x < TILE_SIZE && y < TILE_SIZE) {
        out.push({ x, y, color })
      }
    }
  }
  return out
}

/** Horizontal stripes — every `gap`th row gets `width`-pixel-tall stripe. */
function stripes(color, width, gap) {
  const out = []
  for (let y = 0; y < TILE_SIZE; y += gap) {
    for (let yy = 0; yy < width && y + yy < TILE_SIZE; yy++) {
      for (let x = 0; x < TILE_SIZE; x++) out.push({ x, y: y + yy, color })
    }
  }
  return out
}

/** Brick pattern — alternating offset 4×2 cells. */
function bricks(mortar, brick) {
  const out = []
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const row = Math.floor(y / 4)
      const offset = row % 2 === 0 ? 0 : 4
      if (y % 4 === 0 || (x + offset) % 8 === 0) {
        out.push({ x, y, color: mortar })
      } else if (Math.random() < 0.05) {
        // Tiny detail — kept seeded by tile position
        const seed = (x * 31 + y) % 17
        if (seed === 0) out.push({ x, y, color: brick })
      }
    }
  }
  return out
}

// ---- Render the sheet to a flat RGBA buffer ----------------------------------
const pixels = Buffer.alloc(SHEET_W * SHEET_H * 4, 0)

function setPixel(x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= SHEET_W || y >= SHEET_H) return
  const i = (y * SHEET_W + x) * 4
  pixels[i] = r
  pixels[i + 1] = g
  pixels[i + 2] = b
  pixels[i + 3] = a
}

TILES.forEach((tile, index) => {
  const col = index % COLUMNS
  const row = Math.floor(index / COLUMNS)
  const x0 = col * TILE_SIZE
  const y0 = row * TILE_SIZE
  const base = hex(tile.base)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      setPixel(x0 + x, y0 + y, base)
    }
  }
  for (const dot of tile.detail ?? []) {
    setPixel(x0 + dot.x, y0 + dot.y, hex(dot.color))
  }
})

// ---- PNG encoder -------------------------------------------------------------
// PNG = signature + IHDR + IDAT + IEND. Color type 6 (RGBA), 8-bit. Each
// scanline is prefixed by a filter byte (0 = none) before zlib-deflate.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const head = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head, data])), 0)
  return Buffer.concat([len, head, data, crc])
}

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SHEET_W, 0)
ihdr.writeUInt32BE(SHEET_H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
ihdr[10] = 0 // compression
ihdr[11] = 0 // filter
ihdr[12] = 0 // interlace

const filtered = Buffer.alloc(SHEET_H * (1 + SHEET_W * 4))
for (let y = 0; y < SHEET_H; y++) {
  filtered[y * (1 + SHEET_W * 4)] = 0 // filter type = none
  pixels.copy(filtered, y * (1 + SHEET_W * 4) + 1, y * SHEET_W * 4, (y + 1) * SHEET_W * 4)
}
const idat = deflateSync(filtered)

const png = Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])

mkdirSync(OUTPUT_DIR, { recursive: true })
writeFileSync(resolve(OUTPUT_DIR, 'minimalist.png'), png)

// ---- Sprite-set JSON ---------------------------------------------------------
// Schema mirrors `games/zelda-like/spritesets/lokiri-forest.json` (the
// only known-good reference for `@pixelrpg/engine`'s SpriteSetFormat).
// Image must declare its own id + type; sprites carry col/row.
const spriteSet = {
  version: '1.0.0',
  id: 'minimalist',
  name: 'Minimalist starter tileset',
  image: {
    id: 'main',
    path: 'minimalist.png',
    type: 'image',
  },
  spriteWidth: TILE_SIZE,
  spriteHeight: TILE_SIZE,
  columns: COLUMNS,
  rows: ROWS,
  margin: 0,
  spacing: 0,
  sprites: TILES.map((tile, index) => ({
    id: index,
    col: index % COLUMNS,
    row: Math.floor(index / COLUMNS),
    name: tile.name,
    ...(tile.tileProperties ? { tileProperties: tile.tileProperties } : {}),
  })),
}

writeFileSync(resolve(OUTPUT_DIR, 'minimalist.json'), `${JSON.stringify(spriteSet, null, 2)}\n`)

// Print a short summary so the runner can sanity-check.
console.log(`Wrote ${SHEET_W}×${SHEET_H}px tileset (${TILE_COUNT} tiles) to`)
console.log(`  ${resolve(OUTPUT_DIR, 'minimalist.png')}`)
console.log(`  ${resolve(OUTPUT_DIR, 'minimalist.json')}`)
