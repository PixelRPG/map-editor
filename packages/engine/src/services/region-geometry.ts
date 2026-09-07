import type { GridCell } from './flood-fill.ts'

/**
 * Pure geometry for drawing a set of grid cells as one shape — the
 * fill-preview region (`services/fill-preview.ts`) and the eraser's
 * single cell (`services/eraser-preview.ts`) both render through it.
 *
 * A flood-fill region is neither a rectangle nor simply connected: it
 * follows the tiles, wraps around islands and leaves holes. Two
 * decompositions turn it into a handful of primitives instead of one
 * draw per cell:
 *
 * - {@link computeRegionRuns} — horizontal runs of consecutive cells
 *   per row, for a translucent tint. A 176 × 148 map filled wholesale
 *   is 148 runs, not 26,048 cells.
 * - {@link computeRegionOutline} — the boundary as axis-aligned
 *   segments. An edge belongs to the outline iff exactly one of the two
 *   cells it separates is in the region, which makes holes fall out
 *   for free; collinear unit edges are merged so a straight border is
 *   one segment.
 *
 * Both scan an occupancy grid over the region's bounding box rather
 * than hashing cell keys: on kokiri-forest's 26,048-cell region the
 * keyed version took 19 ms, which on top of the 17 ms flood fill made
 * entering a large region a visible hitch. The grid is O(bounding box)
 * and yields runs and segments already sorted, so no sort pass either.
 *
 * Coordinates are in cell units: a run `{ y, x0, x1 }` covers cells
 * `x0 ≤ x < x1` of row `y`; a segment joins two cell CORNERS, so the
 * top edge of cell `(x, y)` is `{ x0: x, y0: y, x1: x + 1, y1: y }`.
 * Callers scale by the tile size. Excalibur-free so it tests under the
 * node target.
 */

/** Consecutive cells `x0 ≤ x < x1` on row `y`. */
export interface RegionRun {
  readonly y: number
  readonly x0: number
  readonly x1: number
}

/** An axis-aligned boundary segment between cell corners `(x0, y0)` and `(x1, y1)`. */
export interface RegionSegment {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** Cell-space bounding box of a region; `x + width` / `y + height` are exclusive. */
export interface RegionBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * Bounding box of `cells`, or `null` for an empty region. The box is
 * what positions the overlay actor (its top-left corner) and sizes the
 * graphic for Excalibur's offscreen culling.
 */
export function computeRegionBounds(cells: readonly GridCell[]): RegionBounds | null {
  if (cells.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const { x, y } of cells) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Decompose `cells` into per-row runs, rows ascending and runs left to
 * right. Duplicate cells collapse into the run they fall in.
 */
export function computeRegionRuns(cells: readonly GridCell[]): RegionRun[] {
  const grid = occupancyGrid(cells)
  if (!grid) return []
  const { bounds, isOccupied } = grid
  const runs: RegionRun[] = []
  for (let y = 0; y < bounds.height; y++) {
    let start = -1
    for (let x = 0; x <= bounds.width; x++) {
      const occupied = x < bounds.width && isOccupied(x, y)
      if (occupied && start < 0) start = x
      if (!occupied && start >= 0) {
        runs.push({ y: y + bounds.y, x0: start + bounds.x, x1: x + bounds.x })
        start = -1
      }
    }
  }
  return runs
}

/**
 * The region's boundary as merged axis-aligned segments — horizontal
 * segments first (by grid line, then left to right), then vertical ones
 * (by grid line, then top to bottom). Both the outer border and every
 * hole are included; a segment does not record which side the region
 * is on, because drawing does not need it.
 */
export function computeRegionOutline(cells: readonly GridCell[]): RegionSegment[] {
  const grid = occupancyGrid(cells)
  if (!grid) return []
  const { bounds, isOccupied } = grid
  const segments: RegionSegment[] = []

  // Grid line `y` (0 … height) separates row `y - 1` from row `y`; an
  // edge lies on it wherever exactly one of the two is in the region.
  // `isOccupied` answers `false` outside the box, which is what makes
  // the first and last lines the outer border.
  for (let y = 0; y <= bounds.height; y++) {
    let start = -1
    for (let x = 0; x <= bounds.width; x++) {
      const edge = x < bounds.width && isOccupied(x, y - 1) !== isOccupied(x, y)
      if (edge && start < 0) start = x
      if (!edge && start >= 0) {
        segments.push({ x0: start + bounds.x, y0: y + bounds.y, x1: x + bounds.x, y1: y + bounds.y })
        start = -1
      }
    }
  }
  for (let x = 0; x <= bounds.width; x++) {
    let start = -1
    for (let y = 0; y <= bounds.height; y++) {
      const edge = y < bounds.height && isOccupied(x - 1, y) !== isOccupied(x, y)
      if (edge && start < 0) start = y
      if (!edge && start >= 0) {
        segments.push({ x0: x + bounds.x, y0: start + bounds.y, x1: x + bounds.x, y1: y + bounds.y })
        start = -1
      }
    }
  }
  return segments
}

/**
 * Occupancy lookup over the region's bounding box, in box-local
 * coordinates. Out-of-box queries (including `-1` and `width`/`height`)
 * are simply "not occupied", so callers can probe neighbours without
 * bounds checks of their own.
 */
function occupancyGrid(
  cells: readonly GridCell[],
): { bounds: RegionBounds; isOccupied: (x: number, y: number) => boolean } | null {
  const bounds = computeRegionBounds(cells)
  if (!bounds) return null
  const { x: originX, y: originY, width, height } = bounds
  const occupied = new Uint8Array(width * height)
  for (const { x, y } of cells) occupied[(y - originY) * width + (x - originX)] = 1
  return {
    bounds,
    isOccupied: (x, y) => x >= 0 && y >= 0 && x < width && y < height && occupied[y * width + x] === 1,
  }
}
