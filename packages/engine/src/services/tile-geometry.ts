/**
 * Pure tile↔world coordinate math. Kept Excalibur-free (plain `{x, y}`
 * in/out) so it unit-tests under the node target; callers wrap the result
 * in a `Vector` where one is needed.
 */

/** A 2D point — structurally compatible with Excalibur's `Vector` / `TileMap.pos`. */
export interface Point2 {
  x: number
  y: number
}

/**
 * World position of the CENTRE of tile `(tileX, tileY)` on a tilemap whose
 * top-left origin is `origin` and whose cells are `tileWidth × tileHeight`.
 *
 * The `+ 0.5` is what makes this the tile *centre* (not its top-left
 * corner) — the right anchor for a cursor dot or a flash outline that
 * should sit in the middle of the tile. Distinct from the corner formula
 * (`origin + coord * size`) used by the placement-preview ghosts.
 */
export function tileToWorldCenter(
  origin: Point2,
  tileWidth: number,
  tileHeight: number,
  tileX: number,
  tileY: number,
): Point2 {
  return {
    x: origin.x + (tileX + 0.5) * tileWidth,
    y: origin.y + (tileY + 0.5) * tileHeight,
  }
}

/**
 * Whether tile `(tileX, tileY)` falls outside a `columns × rows` map — the
 * shared bounds guard for programmatic paint / object placement (the
 * headless equivalents of a pointer click). `columns`/`rows` are exclusive
 * upper bounds, so the last valid tile is `(columns - 1, rows - 1)`;
 * negative coords and zero-sized maps are always out of bounds.
 */
export function isTileOutOfBounds(tileX: number, tileY: number, columns: number, rows: number): boolean {
  return tileX < 0 || tileY < 0 || tileX >= columns || tileY >= rows
}
