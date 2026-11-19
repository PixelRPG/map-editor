/**
 * Region indexing for solid-tile collision.
 *
 * Excalibur transforms and re-hashes every member of a tilemap's
 * composite collider each frame, so collision cost grows with the number
 * of solid tiles on the map (`docs/design/excalibur-1.md` § P4). Region
 * collision keeps that composite small: the map is cut into square
 * chunks of {@link COLLISION_REGION_TILES} tiles, and only the chunks
 * near a physics-active body hold colliders.
 *
 * 16 × 16 tiles = 256 tiles per region. Small enough that a rebuild
 * (a border crossing, not a frame) scans well under 2,500 tiles for the
 * usual 1–4 active regions; large enough that the hero crosses a
 * border every few seconds, not every few steps.
 *
 * Everything here is pure arithmetic over a mask (one byte per region),
 * so it is specced without an engine and allocates nothing per call.
 */

/** Edge length of one region, in tiles. */
export const COLLISION_REGION_TILES = 16

/**
 * How far past a body a region still counts as "near", in tiles.
 * A region becomes active well before the body can reach its walls.
 */
export const COLLISION_MARGIN_TILES = 4

/**
 * Seconds of travel at the current velocity added to the margin. Matches
 * Excalibur's own cap on one frame's elapsed time (200 ms), so even a
 * clamped long frame cannot carry a body into an inactive region.
 */
export const COLLISION_LOOKAHEAD_S = 0.2

/** The region layout of one tile grid. */
export interface RegionGrid {
  readonly columns: number
  readonly rows: number
  readonly regionTiles: number
  readonly regionColumns: number
  readonly regionRows: number
  readonly count: number
}

export function createRegionGrid(
  columns: number,
  rows: number,
  regionTiles: number = COLLISION_REGION_TILES,
): RegionGrid {
  const regionColumns = Math.max(1, Math.ceil(columns / regionTiles))
  const regionRows = Math.max(1, Math.ceil(rows / regionTiles))
  return { columns, rows, regionTiles, regionColumns, regionRows, count: regionColumns * regionRows }
}

/** Index of the region holding tile `(tileX, tileY)`, or -1 off the grid. */
export function regionIndexOfTile(grid: RegionGrid, tileX: number, tileY: number): number {
  if (tileX < 0 || tileY < 0 || tileX >= grid.columns || tileY >= grid.rows) return -1
  const rx = Math.floor(tileX / grid.regionTiles)
  const ry = Math.floor(tileY / grid.regionTiles)
  return ry * grid.regionColumns + rx
}

/**
 * Mark every region that the tile-space rectangle touches. Fractional
 * tile coordinates are fine; the rectangle is clamped to the grid, so a
 * body outside the map keeps the nearest edge regions active.
 */
export function markRegionsInRect(
  grid: RegionGrid,
  mask: Uint8Array,
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  const maxRx = grid.regionColumns - 1
  const maxRy = grid.regionRows - 1
  const rx0 = clamp(Math.floor(left / grid.regionTiles), 0, maxRx)
  const rx1 = clamp(Math.floor(right / grid.regionTiles), 0, maxRx)
  const ry0 = clamp(Math.floor(top / grid.regionTiles), 0, maxRy)
  const ry1 = clamp(Math.floor(bottom / grid.regionTiles), 0, maxRy)
  for (let ry = ry0; ry <= ry1; ry++) {
    for (let rx = rx0; rx <= rx1; rx++) mask[ry * grid.regionColumns + rx] = 1
  }
}

/** Mark the regions within `marginX` / `marginY` tiles of a point in tile space. */
export function markRegionsAround(
  grid: RegionGrid,
  mask: Uint8Array,
  tileX: number,
  tileY: number,
  marginX: number,
  marginY: number,
): void {
  markRegionsInRect(grid, mask, tileX - marginX, tileY - marginY, tileX + marginX, tileY + marginY)
}

export function masksEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}
