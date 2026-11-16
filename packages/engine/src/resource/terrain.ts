import type { SpriteSetData, TerrainData } from '../types/data/index.ts'

/**
 * The matching rule behind a terrain brush: look at a cell's eight
 * neighbours, build a mask, look the mask up in the terrain's sparse
 * table, and fall back to the nearest entry when it has none.
 *
 * One mask model covers every sheet layout the editor supports — a
 * 16-entry table is an edge set, 9 a plain block, 13 a patch, 29 this
 * pack's ground, 47 a full blob. The PRESET decides how many entries
 * get filled (`terrain-presets.ts`); this module is the single code
 * path they all run through.
 *
 * Pure arithmetic over plain data — no Excalibur, no scene, no map —
 * so every shape a brush would paint is unit-testable without loading
 * anything. `docs/design/ui-redesign/TERRAIN.md` §3.1 is the design.
 */

/**
 * The eight neighbour bits.
 *
 * Clockwise from north so the numeric order matches the way the pieces
 * are described in prose ("T: east·south·west").
 */
export const TERRAIN_N = 1
export const TERRAIN_NE = 2
export const TERRAIN_E = 4
export const TERRAIN_SE = 8
export const TERRAIN_S = 16
export const TERRAIN_SW = 32
export const TERRAIN_W = 64
export const TERRAIN_NW = 128

/** Every bit set — a cell surrounded on all eight sides. */
export const TERRAIN_MASK_FULL = 255

/** The four edge bits, in mask order. */
export const TERRAIN_EDGE_BITS: readonly number[] = [TERRAIN_N, TERRAIN_E, TERRAIN_S, TERRAIN_W]

/**
 * The four corner bits with the two edges that must ALSO be set for
 * them to count. A diagonal neighbour touching only at a point changes
 * no pixel of the tile, so it must not change which tile is chosen.
 */
const TERRAIN_CORNERS: readonly { readonly bit: number; readonly edges: number }[] = [
  { bit: TERRAIN_NE, edges: TERRAIN_N | TERRAIN_E },
  { bit: TERRAIN_SE, edges: TERRAIN_S | TERRAIN_E },
  { bit: TERRAIN_SW, edges: TERRAIN_S | TERRAIN_W },
  { bit: TERRAIN_NW, edges: TERRAIN_N | TERRAIN_W },
]

/** The four corner bits, in mask order. */
export const TERRAIN_CORNER_BITS: readonly number[] = TERRAIN_CORNERS.map((corner) => corner.bit)

/**
 * Drop every corner bit whose two adjacent edges are not both set.
 *
 * This is what collapses 256 raw neighbourhoods to the classic 47
 * distinct ones, and it is applied on BOTH sides — when a mask is read
 * off the map and when a preset's table is built — so a table can only
 * ever hold normalised keys and a lookup can only ever ask with one.
 */
export function normaliseTerrainMask(mask: number): number {
  let normalised = mask & TERRAIN_MASK_FULL
  for (const corner of TERRAIN_CORNERS) {
    if ((normalised & corner.edges) !== corner.edges) normalised &= ~corner.bit
  }
  return normalised
}

/** Whether `mask` is already normalised (no corner without its edges). */
export function isNormalisedTerrainMask(mask: number): boolean {
  return normaliseTerrainMask(mask) === mask
}

/**
 * All 47 normalised masks, ascending.
 *
 * Derived rather than tabulated: a hand-written list of 47 numbers is a
 * second definition of {@link normaliseTerrainMask} that can drift from
 * it, and this is cheap enough to compute at module load.
 */
export const TERRAIN_MASKS: readonly number[] = (() => {
  const masks = new Set<number>()
  for (let raw = 0; raw <= TERRAIN_MASK_FULL; raw++) masks.add(normaliseTerrainMask(raw))
  return [...masks].sort((a, b) => a - b)
})()

/** Whether the cell at `(x, y)` holds this terrain. */
export type TerrainProbe = (x: number, y: number) => boolean

/** The map extent a mask is read inside — `MapData.columns` / `.rows`. */
export interface TerrainBounds {
  readonly columns: number
  readonly rows: number
}

/** The eight neighbour offsets, paired with the bit each one sets. */
const TERRAIN_OFFSETS: readonly { readonly dx: number; readonly dy: number; readonly bit: number }[] = [
  { dx: 0, dy: -1, bit: TERRAIN_N },
  { dx: 1, dy: -1, bit: TERRAIN_NE },
  { dx: 1, dy: 0, bit: TERRAIN_E },
  { dx: 1, dy: 1, bit: TERRAIN_SE },
  { dx: 0, dy: 1, bit: TERRAIN_S },
  { dx: -1, dy: 1, bit: TERRAIN_SW },
  { dx: -1, dy: 0, bit: TERRAIN_W },
  { dx: -1, dy: -1, bit: TERRAIN_NW },
]

/**
 * The normalised mask for the cell at `(x, y)`.
 *
 * Cells beyond `bounds` count as the SAME terrain, so water runs off
 * the edge of the map instead of drawing a shore along the border —
 * the map's edge is where the world stops, not where the lake does.
 * Without `bounds` every neighbour is probed and the caller's `probe`
 * decides what lies outside.
 */
export function terrainMaskAt(x: number, y: number, probe: TerrainProbe, bounds?: TerrainBounds): number {
  let mask = 0
  for (const offset of TERRAIN_OFFSETS) {
    const nx = x + offset.dx
    const ny = y + offset.dy
    const outside = bounds ? nx < 0 || ny < 0 || nx >= bounds.columns || ny >= bounds.rows : false
    if (outside || probe(nx, ny)) mask |= offset.bit
  }
  return normaliseTerrainMask(mask)
}

/** How far `candidate` is from `wanted`, as §3.1's cost. */
function maskDistance(wanted: number, candidate: number): number {
  const differing = wanted ^ candidate
  let cost = 0
  // An edge is the difference between a piece that connects and one
  // that does not — four times a corner, which is a notch a few pixels
  // wide. The numbers only have to order the candidates.
  for (const bit of TERRAIN_EDGE_BITS) if (differing & bit) cost += 4
  for (const bit of TERRAIN_CORNER_BITS) if (differing & bit) cost += 1
  return cost
}

/** How many bits `mask` has set. */
function bitCount(mask: number): number {
  let count = 0
  for (let bit = 1; bit <= TERRAIN_MASK_FULL; bit <<= 1) if (mask & bit) count++
  return count
}

/**
 * Every mask the terrain has a tile for, ascending — the table's keys
 * as numbers, with anything unparseable or denormalised dropped.
 *
 * Hand-written JSON is a real source of these tables, so a key of
 * `"foo"` or `"256"` must not become `NaN` inside the resolver.
 */
export function terrainMasks(terrain: TerrainData): number[] {
  const masks: number[] = []
  for (const key of Object.keys(terrain.tiles)) {
    const mask = Number(key)
    if (!Number.isInteger(mask) || mask < 0 || mask > TERRAIN_MASK_FULL) continue
    if (!isNormalisedTerrainMask(mask)) continue
    masks.push(mask)
  }
  return masks.sort((a, b) => a - b)
}

/**
 * The sprite id for `mask`: the exact entry, or else the NEAREST one.
 *
 * Painting never fails and never leaves a hole — a terrain with a
 * single tile in its table paints that tile everywhere. `null` only for
 * a table with no usable entry at all.
 *
 * Ties go to the entry with more bits set (a fuller piece reads as a
 * continuation of the shape, an emptier one as a break in it), then to
 * the lower mask, so the answer is deterministic across peers rather
 * than dependent on key order.
 */
export function resolveTerrainTile(terrain: TerrainData, mask: number): number | null {
  const wanted = normaliseTerrainMask(mask)
  const exact = terrain.tiles[String(wanted)]
  if (exact !== undefined) return exact

  let best: number | null = null
  let bestMask = 0
  let bestDistance = Number.POSITIVE_INFINITY
  let bestBits = -1
  for (const candidate of terrainMasks(terrain)) {
    const distance = maskDistance(wanted, candidate)
    const bits = bitCount(candidate)
    const better =
      distance < bestDistance ||
      (distance === bestDistance && (bits > bestBits || (bits === bestBits && candidate < bestMask)))
    if (!better) continue
    best = terrain.tiles[String(candidate)] ?? null
    bestMask = candidate
    bestDistance = distance
    bestBits = bits
  }
  return best
}

/**
 * How many cells across one tap of this brush paints — 1 or 2.
 *
 * DERIVED from the table, not stored: a terrain with no entry for mask
 * 0 has no "single" tile, which means every 1-wide shape it could paint
 * would be a nearest-match guess at a piece the sheet does not contain
 * (for the 13-tile patches, a lone quarter-pond). Such a terrain paints
 * a 2×2 footprint instead, where the thirteen pieces are enough.
 */
export function terrainFootprint(terrain: TerrainData): 1 | 2 {
  return terrain.tiles['0'] === undefined ? 2 : 1
}

/**
 * The cells one tap at `(x, y)` covers: the tapped cell, plus its
 * right, lower and lower-right neighbours for a 2×2 brush.
 *
 * Anchored top-left like the tile stamp, for the same reason — the
 * hovered cell is the one the brush starts at, whatever its size.
 */
export function terrainFootprintCells(terrain: TerrainData, x: number, y: number): { x: number; y: number }[] {
  if (terrainFootprint(terrain) === 1) return [{ x, y }]
  return [
    { x, y },
    { x: x + 1, y },
    { x, y: y + 1 },
    { x: x + 1, y: y + 1 },
  ]
}

/**
 * What the definition dialog says about coverage — a sentence, not a
 * number (§3.1). The caller translates it; this only decides which of
 * the two it is.
 */
export function terrainPaintsPaths(terrain: TerrainData): boolean {
  return terrainFootprint(terrain) === 1
}

/**
 * Every sprite id that COUNTS as this terrain when a neighbour is
 * examined: its variants plus its `members`.
 */
export function terrainSpriteIds(terrain: TerrainData): Set<number> {
  const ids = new Set<number>()
  for (const mask of terrainMasks(terrain)) {
    const id = terrain.tiles[String(mask)]
    if (id !== undefined) ids.add(id)
  }
  for (const id of terrain.members ?? []) ids.add(id)
  return ids
}

/** Whether `spriteId` counts as this terrain. */
export function spriteBelongsToTerrain(terrain: TerrainData, spriteId: number): boolean {
  return terrainSpriteIds(terrain).has(spriteId)
}

/**
 * Sprite id → the terrain it belongs to, for a whole sprite set.
 *
 * A sprite belongs to AT MOST ONE terrain; the definition dialog
 * enforces it, and a set that breaks the rule anyway resolves to the
 * first terrain that claims the sprite rather than throwing — a
 * hand-edited JSON should not make a map unopenable.
 *
 * Built once per sprite set and handed to the planner, because the
 * alternative is a linear scan of every terrain's table per neighbour
 * per painted cell.
 */
export function terrainIndexOf(data: Pick<SpriteSetData, 'terrains'>): Map<number, TerrainData> {
  const index = new Map<number, TerrainData>()
  for (const terrain of data.terrains ?? []) {
    for (const id of terrainSpriteIds(terrain)) {
      if (!index.has(id)) index.set(id, terrain)
    }
  }
  return index
}

/** The terrain with this id, or `undefined`. */
export function findTerrain(data: Pick<SpriteSetData, 'terrains'>, terrainId: string): TerrainData | undefined {
  return data.terrains?.find((terrain) => terrain.id === terrainId)
}

/**
 * The sprite the chip shows: the explicit `icon`, else the "single"
 * tile (mask 0), else the filled centre (mask 255), else whatever the
 * table's lowest mask points at. `null` for an empty table.
 */
export function terrainIconSpriteId(terrain: TerrainData): number | null {
  if (terrain.icon !== undefined) return terrain.icon
  const single = terrain.tiles['0']
  if (single !== undefined) return single
  const centre = terrain.tiles[String(TERRAIN_MASK_FULL)]
  if (centre !== undefined) return centre
  const first = terrainMasks(terrain)[0]
  return first === undefined ? null : (terrain.tiles[String(first)] ?? null)
}
