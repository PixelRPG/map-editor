import {
  TERRAIN_E,
  TERRAIN_EDGE_BITS,
  TERRAIN_MASK_FULL,
  TERRAIN_N,
  TERRAIN_NE,
  TERRAIN_NW,
  TERRAIN_S,
  TERRAIN_SE,
  TERRAIN_SW,
  TERRAIN_W,
} from './terrain.ts'
import type { TerrainLayout, TerrainPreset } from '../types/data/index.ts'
import { TERRAIN_PRESETS, defaultTerrainLayout, terrainPresetPlacement } from './terrain-presets.ts'

/**
 * What one tile's alpha says about its shape (TERRAIN.md §2): which of
 * the four edge midpoints and four corner pixels are opaque, in the
 * mask's own bit order (N=1 … NW=128), and whether the tile is empty.
 *
 * Blank is separate because a "single" tile has the same eight bits as
 * nothing at all.
 */
export interface TileSignature {
  readonly bits: number
  readonly blank: boolean
}

/** A block of the sheet that looks like a preset. */
export interface TerrainProposal {
  readonly preset: TerrainPreset
  readonly layout: TerrainLayout
  /** Sheet position of the first part's top-left, in cells. */
  readonly col: number
  readonly row: number
}

/**
 * The signature a tile with `mask` must have.
 *
 * Edges are strict: the midpoint is opaque exactly when the neighbour
 * on that side is terrain. A corner pixel is only pinned where both its
 * edges are set — opaque with the diagonal, transparent without it
 * (an inner corner). Elsewhere a rounded corner and a square one are
 * both fine, so it is left open.
 */
function expectation(mask: number): { care: number; bits: number } {
  let care = 0
  for (const bit of TERRAIN_EDGE_BITS) care |= bit
  let bits = mask & care
  const corners: [number, number][] = [
    [TERRAIN_NE, TERRAIN_N | TERRAIN_E],
    [TERRAIN_SE, TERRAIN_S | TERRAIN_E],
    [TERRAIN_SW, TERRAIN_S | TERRAIN_W],
    [TERRAIN_NW, TERRAIN_N | TERRAIN_W],
  ]
  for (const [corner, edges] of corners) {
    if ((mask & edges) !== edges) continue
    care |= corner
    if (mask & corner) bits |= corner
  }
  return { care, bits }
}

function cellMatches(signature: TileSignature | undefined, mask: number): boolean {
  if (!signature) return false
  if (signature.blank) return false
  const { care, bits } = expectation(mask)
  return (signature.bits & care) === bits
}

/**
 * Find the blocks of a sheet that look like one of the layout presets.
 *
 * The method of §2 as a function: every cell of a placed preset must
 * match the alpha signature its mask predicts. Presets are tried
 * richest first and a tile joins at most one proposal, so `ground-29`
 * is not also reported as the `patch-13` inside it.
 *
 * Only sheets whose pieces have TRANSPARENT surroundings can be read
 * this way. A group with its ground baked in (this pack's water) has
 * opaque edges everywhere and is not found — it needs the manual route.
 */
export function findTerrainProposals(
  signatures: readonly (TileSignature | undefined)[],
  grid: { readonly columns: number; readonly rows: number },
  excluded: ReadonlySet<number> = new Set(),
): TerrainProposal[] {
  const used = new Set<number>(excluded)
  const found: TerrainProposal[] = []
  for (const spec of TERRAIN_PRESETS) {
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.columns; col++) {
        const layout = defaultTerrainLayout(spec.preset, col, row)
        const cells = terrainPresetPlacement(spec.preset, layout.parts)
        const ids: number[] = []
        let ok = cells.length > 0
        for (const cell of cells) {
          if (cell.col < 0 || cell.row < 0 || cell.col >= grid.columns || cell.row >= grid.rows) {
            ok = false
            break
          }
          const id = cell.row * grid.columns + cell.col
          if (used.has(id) || !cellMatches(signatures[id], cell.mask)) {
            ok = false
            break
          }
          ids.push(id)
        }
        if (!ok || !isInformative(ids, signatures)) continue
        for (const id of ids) used.add(id)
        found.push({ preset: spec.preset, layout, col, row })
      }
    }
  }
  return found
}

/** A match among identical full tiles says nothing about a shape. */
function isInformative(ids: readonly number[], signatures: readonly (TileSignature | undefined)[]): boolean {
  const distinct = new Set(ids.map((id) => signatures[id]?.bits))
  return distinct.size > 1 && !(distinct.size === 1 && distinct.has(TERRAIN_MASK_FULL))
}
