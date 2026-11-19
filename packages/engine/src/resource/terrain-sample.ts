import type { TerrainData } from '../types/data/TerrainData.ts'
import { resolveTerrainTile, terrainMaskAt } from './terrain.ts'

/**
 * The test shape the definition dialog paints a terrain onto while the
 * block is being placed (TERRAIN.md §5.2).
 *
 * The point of the sample is that a WRONG placement is obvious without
 * knowing what an inner corner is: shift the frame by one row and the
 * picture turns to rubble. That only works if the shape asks for most
 * of the pieces a preset has, so this one contains, in order:
 *
 *   - a 1-wide path with two ends, a T-junction and a bend
 *   - a filled blob whose lower-left and upper-right ask for an inner
 *     corner (masks 223 and 247)
 *   - a ring, for the four outer corners and all four edges
 *   - a single lone cell (mask 0)
 *
 * A terrain without 1-wide pieces (`patch-13`, `block-9`) renders the
 * path through nearest-match, which is the honest answer: that brush
 * cannot paint a path, and the sample says so before anything is saved.
 *
 * Pure data — the widget that draws it maps sprite ids to paintables.
 */

/** Columns of {@link TERRAIN_SAMPLE_SHAPE}. */
export const TERRAIN_SAMPLE_COLUMNS = 14

/** Rows of {@link TERRAIN_SAMPLE_SHAPE}. */
export const TERRAIN_SAMPLE_ROWS = 10

/** `#` is a cell of the terrain, anything else is bare floor. */
export const TERRAIN_SAMPLE_SHAPE: readonly string[] = [
  '..............',
  '.#####...####.',
  '...#.....####.',
  '...###...###..',
  '..........##..',
  '..............',
  '.####.....#...',
  '.#..#.........',
  '.####.........',
  '..............',
]

/** Whether the sample has terrain at `(x, y)`; outside the grid is floor. */
export function terrainSampleFilled(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= TERRAIN_SAMPLE_COLUMNS || y >= TERRAIN_SAMPLE_ROWS) return false
  return TERRAIN_SAMPLE_SHAPE[y]?.[x] === '#'
}

/**
 * The mask every cell of the sample ASKS FOR, row-major: `null` where
 * the shape is bare floor.
 *
 * Independent of any terrain — the shape is fixed, so which piece each
 * cell wants is fixed too. The fix-up page (§5.3) is built on this: a
 * tap on a cell has to name the table row it edits, and the resolved
 * sprite id cannot, because a nearest match points at a row for a
 * different mask.
 *
 * No bounds are passed: the sample is a window onto a larger world, so
 * the shape is surrounded by floor rather than by more of itself.
 */
export function terrainSampleMasks(): (number | null)[] {
  const masks: (number | null)[] = []
  for (let y = 0; y < TERRAIN_SAMPLE_ROWS; y++) {
    for (let x = 0; x < TERRAIN_SAMPLE_COLUMNS; x++) {
      masks.push(terrainSampleFilled(x, y) ? terrainMaskAt(x, y, terrainSampleFilled) : null)
    }
  }
  return masks
}

/**
 * The sprite id for every cell of the sample, row-major: `null` where
 * the shape is bare floor, and the resolved variant everywhere else.
 *
 * Runs through the same {@link terrainMaskAt} / {@link resolveTerrainTile}
 * pair the painter uses. A terrain with an empty table yields all
 * `null`, which the dialog shows as plain floor rather than as an error.
 */
export function terrainSampleTiles(terrain: TerrainData): (number | null)[] {
  return terrainSampleMasks().map((mask) => (mask == null ? null : resolveTerrainTile(terrain, mask)))
}
