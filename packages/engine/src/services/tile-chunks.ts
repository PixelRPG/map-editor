/**
 * Chunk indexing for the baked tile planes: which 16×16-tile block a
 * tile belongs to, and which blocks a world-space rectangle touches.
 *
 * Pure arithmetic with no Excalibur import, so the border cases
 * (maps that are not a multiple of the chunk size, rectangles hanging
 * off the map) are specced without an engine. Functions that return a
 * range write into a caller-owned `out` so the per-frame path
 * allocates nothing.
 */

/** Tiles per chunk edge. 16 × 16 px tiles bake to a 256 × 256 px texture. */
export const CHUNK_TILES = 16

export interface ChunkGrid {
  columns: number
  rows: number
  chunkTiles: number
  chunkColumns: number
  chunkRows: number
}

/** Half-open chunk (or tile) rectangle: `x0 <= x < x1`. Empty when `x1 <= x0`. */
export interface IndexRange {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function makeIndexRange(): IndexRange {
  return { x0: 0, y0: 0, x1: 0, y1: 0 }
}

export function makeChunkGrid(columns: number, rows: number, chunkTiles = CHUNK_TILES): ChunkGrid {
  return {
    columns,
    rows,
    chunkTiles,
    chunkColumns: Math.ceil(columns / chunkTiles),
    chunkRows: Math.ceil(rows / chunkTiles),
  }
}

export function chunkCount(grid: ChunkGrid): number {
  return grid.chunkColumns * grid.chunkRows
}

/** Flat chunk index of a tile, or `-1` when the tile is off the map. */
export function chunkIndexOfTile(grid: ChunkGrid, tileX: number, tileY: number): number {
  if (tileX < 0 || tileY < 0 || tileX >= grid.columns || tileY >= grid.rows) return -1
  return Math.floor(tileY / grid.chunkTiles) * grid.chunkColumns + Math.floor(tileX / grid.chunkTiles)
}

/** Tiles of one chunk, clamped to the map (the last chunk may be partial). */
export function tileRangeOfChunk(grid: ChunkGrid, chunkX: number, chunkY: number, out: IndexRange): IndexRange {
  out.x0 = chunkX * grid.chunkTiles
  out.y0 = chunkY * grid.chunkTiles
  out.x1 = Math.min(out.x0 + grid.chunkTiles, grid.columns)
  out.y1 = Math.min(out.y0 + grid.chunkTiles, grid.rows)
  return out
}

/**
 * Chunks touched by a rectangle given in map-local pixels (map origin
 * already subtracted), clamped to the map. A rectangle wholly off the
 * map, or with no area, yields an empty range.
 */
export function chunkRangeOfRect(
  grid: ChunkGrid,
  tileWidth: number,
  tileHeight: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  out: IndexRange,
): IndexRange {
  const chunkW = grid.chunkTiles * tileWidth
  const chunkH = grid.chunkTiles * tileHeight
  out.x0 = Math.max(0, Math.floor(left / chunkW))
  out.y0 = Math.max(0, Math.floor(top / chunkH))
  // `right` / `bottom` are exclusive edges: a rect ending exactly on a
  // chunk border does not touch the next chunk.
  out.x1 = Math.min(grid.chunkColumns, Math.ceil(right / chunkW))
  out.y1 = Math.min(grid.chunkRows, Math.ceil(bottom / chunkH))
  if (right <= left || bottom <= top || out.x1 <= out.x0 || out.y1 <= out.y0) {
    out.x1 = out.x0
    out.y1 = out.y0
  }
  return out
}
