import { TerrainPreset } from '../types/data/TerrainData.ts'
import type { TerrainLayout, TerrainLayoutPart } from '../types/data/TerrainData.ts'
import { TERRAIN_E, TERRAIN_MASKS, TERRAIN_N, TERRAIN_S, TERRAIN_W, isNormalisedTerrainMask } from './terrain.ts'

/**
 * Where the variants of a terrain sit in a block of the sheet.
 *
 * A preset is a PICTURE-LEVEL description — "a 3×3 square and four
 * corner pieces" — not a second matching rule: applying one writes
 * {@link TerrainData.tiles} and is then forgotten, exactly like a
 * collision preset is re-derived rather than stored. `terrain.ts` is
 * the single code path every table runs through, whatever filled it.
 *
 * Each preset is a set of **parts**: rectangular sub-blocks with a
 * default position relative to the first. A sheet that arranges the
 * same pieces slightly differently then needs a nudge rather than a new
 * preset — this pack's water is the case that forced it, its inner
 * corners sitting one row below everyone else's (§2.2).
 *
 * Pure data and arithmetic. `docs/design/ui-redesign/TERRAIN.md` §4.
 */

/** One rectangular sub-block of a preset. */
export interface TerrainPresetPart {
  /** Stable within the preset; the key in {@link TerrainLayout.parts}. */
  readonly id: string
  readonly columns: number
  readonly rows: number
  /**
   * Default top-left relative to the FIRST part's top-left, in cells.
   * `0, 0` for the first part itself.
   */
  readonly dc: number
  readonly dr: number
}

/** One tile of a preset: where it sits in its part, and what it matches. */
export interface TerrainPresetCell {
  /** {@link TerrainPresetPart.id} of the part this cell belongs to. */
  readonly part: string
  readonly dc: number
  readonly dr: number
  /** The normalised 8-neighbour mask this tile is the picture of. */
  readonly mask: number
}

/** A preset's parts and the tiles inside them. */
export interface TerrainPresetSpec {
  readonly preset: TerrainPreset
  readonly parts: readonly TerrainPresetPart[]
  readonly cells: readonly TerrainPresetCell[]
}

/** The 3×3 filled block, shared by every preset that has one. */
const BLOCK_CELLS: readonly TerrainPresetCell[] = [
  { part: 'block', dc: 0, dr: 0, mask: 28 },
  { part: 'block', dc: 1, dr: 0, mask: 124 },
  { part: 'block', dc: 2, dr: 0, mask: 112 },
  { part: 'block', dc: 0, dr: 1, mask: 31 },
  { part: 'block', dc: 1, dr: 1, mask: 255 },
  { part: 'block', dc: 2, dr: 1, mask: 241 },
  { part: 'block', dc: 0, dr: 2, mask: 7 },
  { part: 'block', dc: 1, dr: 2, mask: 199 },
  { part: 'block', dc: 2, dr: 2, mask: 193 },
]

/** The 3×3 block part, shared the same way. */
const BLOCK_PART: TerrainPresetPart = { id: 'block', columns: 3, rows: 3, dc: 0, dr: 0 }

/**
 * `ground-29` — one 5×6 block holding a complete 1-wide path set (16
 * tiles: ends, straights, bends, T-junctions, cross, single) plus a
 * complete filled-area set (13: the 3×3 block and four inner corners).
 * The last cell of the block is empty.
 *
 * Measured off this pack's dirt, stone and sand (§2.1); named for its
 * shape, because Kenney's other 16 px packs repeat it.
 */
const GROUND_29: TerrainPresetSpec = {
  preset: TerrainPreset.Ground29,
  parts: [{ id: 'block', columns: 5, rows: 6, dc: 0, dr: 0 }],
  cells: [
    { part: 'block', dc: 0, dr: 0, mask: 84 },
    { part: 'block', dc: 1, dr: 0, mask: 81 },
    { part: 'block', dc: 2, dr: 0, mask: 20 },
    { part: 'block', dc: 3, dr: 0, mask: 80 },
    { part: 'block', dc: 4, dr: 0, mask: 17 },
    { part: 'block', dc: 0, dr: 1, mask: 21 },
    { part: 'block', dc: 1, dr: 1, mask: 69 },
    { part: 'block', dc: 2, dr: 1, mask: 5 },
    { part: 'block', dc: 3, dr: 1, mask: 65 },
    { part: 'block', dc: 4, dr: 1, mask: 68 },
    { part: 'block', dc: 0, dr: 2, mask: 247 },
    { part: 'block', dc: 1, dr: 2, mask: 223 },
    { part: 'block', dc: 2, dr: 2, mask: 28 },
    { part: 'block', dc: 3, dr: 2, mask: 124 },
    { part: 'block', dc: 4, dr: 2, mask: 112 },
    { part: 'block', dc: 0, dr: 3, mask: 253 },
    { part: 'block', dc: 1, dr: 3, mask: 127 },
    { part: 'block', dc: 2, dr: 3, mask: 31 },
    { part: 'block', dc: 3, dr: 3, mask: 255 },
    { part: 'block', dc: 4, dr: 3, mask: 241 },
    { part: 'block', dc: 0, dr: 4, mask: 1 },
    { part: 'block', dc: 1, dr: 4, mask: 16 },
    { part: 'block', dc: 2, dr: 4, mask: 7 },
    { part: 'block', dc: 3, dr: 4, mask: 199 },
    { part: 'block', dc: 4, dr: 4, mask: 193 },
    { part: 'block', dc: 0, dr: 5, mask: 64 },
    { part: 'block', dc: 1, dr: 5, mask: 4 },
    { part: 'block', dc: 2, dr: 5, mask: 85 },
    { part: 'block', dc: 3, dr: 5, mask: 0 },
  ],
}

/**
 * `patch-13` — a 3×3 block plus a 2×2 of inner corners, by default two
 * columns left of the block on the same top row. No 1-wide pieces, so a
 * brush built from it paints a 2×2 footprint ({@link terrainFootprint}).
 *
 * Fits this pack's water (corners one row down), pool, flower beds,
 * grass and leaves (§2.2). The inner corners are arranged as in the
 * ground group: SE·SW above, NE·NW below.
 */
const PATCH_13: TerrainPresetSpec = {
  preset: TerrainPreset.Patch13,
  parts: [BLOCK_PART, { id: 'corners', columns: 2, rows: 2, dc: -2, dr: 0 }],
  cells: [
    ...BLOCK_CELLS,
    { part: 'corners', dc: 0, dr: 0, mask: 247 },
    { part: 'corners', dc: 1, dr: 0, mask: 223 },
    { part: 'corners', dc: 0, dr: 1, mask: 253 },
    { part: 'corners', dc: 1, dr: 1, mask: 127 },
  ],
}

/**
 * `block-9` — one plain 3×3 block, no inner corners. This pack's rimmed
 * pools and rugs, and most "fence around an area" art (§2.3).
 */
const BLOCK_9: TerrainPresetSpec = {
  preset: TerrainPreset.Block9,
  parts: [BLOCK_PART],
  cells: BLOCK_CELLS,
}

/**
 * `path-16` — one 4×4 block of 1-wide pieces only: every combination of
 * the four edges, no areas and no inner corners.
 *
 * Row-major, and the cell index IS the bit pattern N=1, E=2, S=4, W=8 —
 * the order the bitmask-autotile tutorials draw their sheets in. The
 * first cell is therefore the lone tile, the last the cross. Sheets in
 * another order are what "Tile by tile" is for; the order cannot be
 * nudged the way a part's position can.
 */
const PATH_16: TerrainPresetSpec = {
  preset: TerrainPreset.Path16,
  parts: [{ id: 'block', columns: 4, rows: 4, dc: 0, dr: 0 }],
  cells: Array.from({ length: 16 }, (_, index) => ({
    part: 'block',
    dc: index % 4,
    dr: Math.floor(index / 4),
    mask:
      (index & 1 ? TERRAIN_N : 0) |
      (index & 2 ? TERRAIN_E : 0) |
      (index & 4 ? TERRAIN_S : 0) |
      (index & 8 ? TERRAIN_W : 0),
  })),
}

/**
 * `blob-47` — one 8×6 block holding every piece the 8-neighbour rule
 * can ask for, in ascending mask order, row-major; the 48th cell is
 * empty.
 *
 * Ascending is the order of the widely copied blob sheets (the bit
 * assignment N=1 … NW=128 is theirs too), and it is DERIVED from
 * {@link TERRAIN_MASKS} rather than typed out, so it cannot disagree
 * with the normalise rule.
 */
const BLOB_47: TerrainPresetSpec = {
  preset: TerrainPreset.Blob47,
  parts: [{ id: 'block', columns: 8, rows: 6, dc: 0, dr: 0 }],
  cells: TERRAIN_MASKS.map((mask, index) => ({
    part: 'block',
    dc: index % 8,
    dr: Math.floor(index / 8),
    mask,
  })),
}

/**
 * Every preset, in the order the picker shows them: the richest first,
 * because a sheet that has the pieces should use them.
 */
export const TERRAIN_PRESETS: readonly TerrainPresetSpec[] = [BLOB_47, GROUND_29, PATCH_13, PATH_16, BLOCK_9]

/** The spec for `preset`, or `undefined` for a name we do not know. */
export function terrainPresetSpec(preset: TerrainPreset | string): TerrainPresetSpec | undefined {
  return TERRAIN_PRESETS.find((spec) => spec.preset === preset)
}

/** The part with this id, or `undefined`. */
export function terrainPresetPart(spec: TerrainPresetSpec, partId: string): TerrainPresetPart | undefined {
  return spec.parts.find((part) => part.id === partId)
}

/**
 * Where each part sits when the first one is dropped at `(col, row)` —
 * the layout the dialog starts from before anything is dragged.
 */
export function defaultTerrainLayout(preset: TerrainPreset, col: number, row: number): TerrainLayout {
  const spec = terrainPresetSpec(preset)
  const parts: Record<string, TerrainLayoutPart> = {}
  for (const part of spec?.parts ?? []) parts[part.id] = { col: col + part.dc, row: row + part.dr }
  return { preset, parts }
}

/** One tile of a placed preset: where it is in the SHEET, and its mask. */
export interface TerrainPlacedCell {
  readonly col: number
  readonly row: number
  readonly mask: number
}

/**
 * The preset's cells resolved against a layout — sheet coordinates.
 *
 * Cells whose part the layout never placed are skipped, so a layout
 * written by hand with half its parts missing yields a smaller table
 * rather than `NaN` coordinates. Also what the definition dialog frames
 * and what it tests for overlap with another terrain (§5.2).
 */
export function terrainPresetPlacement(
  preset: TerrainPreset | string,
  parts: Record<string, TerrainLayoutPart>,
): TerrainPlacedCell[] {
  const spec = terrainPresetSpec(preset)
  if (!spec) return []
  const placed: TerrainPlacedCell[] = []
  for (const cell of spec.cells) {
    const origin = parts[cell.part]
    if (!origin) continue
    placed.push({ col: origin.col + cell.dc, row: origin.row + cell.dr, mask: cell.mask })
  }
  return placed
}

/**
 * The `tiles` table a placed preset produces, for a sheet `columns`
 * wide — the one place a preset turns into terrain data.
 *
 * Sprite ids follow the rule every sheet the import dialog writes uses,
 * `row * columns + col`. A cell that lands outside the sheet is
 * dropped; the dialog keeps "Create" insensitive while that can happen,
 * and a hand-written layout should still not invent sprite ids.
 */
export function terrainTilesForPreset(
  preset: TerrainPreset | string,
  parts: Record<string, TerrainLayoutPart>,
  sheet: { readonly columns: number; readonly rows?: number },
): Record<string, number> {
  const tiles: Record<string, number> = {}
  for (const cell of terrainPresetPlacement(preset, parts)) {
    if (cell.col < 0 || cell.row < 0 || cell.col >= sheet.columns) continue
    if (sheet.rows !== undefined && cell.row >= sheet.rows) continue
    if (!isNormalisedTerrainMask(cell.mask)) continue
    tiles[String(cell.mask)] = cell.row * sheet.columns + cell.col
  }
  return tiles
}
