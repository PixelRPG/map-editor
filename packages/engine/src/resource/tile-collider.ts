import { type Collider, type PolygonCollider, Colliders, type Tile, Vector, vec } from 'excalibur'
import type { ColliderShape } from '../types/data/index.ts'

/**
 * Turning stored {@link ColliderShape} data into Excalibur colliders on a
 * {@link Tile}.
 *
 * The data half of this lives in `tile-collision.ts` and is pure; this
 * file is the only place that knows Excalibur's conventions:
 *
 *   - A collider only blocks when `tile.solid` is true. A solid tile
 *     with no colliders falls back to its bounds, which is what makes
 *     "Wall" storable as `solid: true` and nothing else.
 *   - A collider's `offset` is TILE-LOCAL. `TileMap._updateColliders`
 *     caches it on first use and then rewrites `offset` to
 *     `tilePos + cachedOffset` on every rebuild, so each tile needs its
 *     OWN collider instances — never share one across tiles.
 *   - A solid tile *with* colliders opts out of the tilemap's solid-tile
 *     meshing and contributes its shapes verbatim.
 */

/**
 * Excalibur colliders for one stored shape, in tile-local coordinates.
 *
 * Usually one collider; a non-convex polygon becomes its triangles.
 * Returns an empty array for a shape that cannot collide (a degenerate
 * rectangle, a polygon with fewer than three points) so bad data drops
 * out instead of throwing mid-load.
 */
export function tileCollidersFor(shape: ColliderShape): Collider[] {
  switch (shape.type) {
    case 'rectangle': {
      if (shape.width <= 0 || shape.height <= 0) return []
      // Anchor (0, 0) puts the box's TOP-LEFT at the offset, matching
      // how `scripts/port-tiled-collision.mjs` stores rectangles.
      const offset = vec(shape.offset?.x ?? 0, shape.offset?.y ?? 0)
      return [Colliders.Box(shape.width, shape.height, Vector.Zero, offset)]
    }
    case 'circle': {
      if (shape.radius <= 0) return []
      // A circle's stored offset is its CENTRE, which is also what
      // `Colliders.Circle` wants.
      return [Colliders.Circle(shape.radius, vec(shape.offset?.x ?? 0, shape.offset?.y ?? 0))]
    }
    case 'polygon': {
      if (!Array.isArray(shape.points) || shape.points.length < 3) return []
      const points = shape.points.map((point) => vec(point.x, point.y))
      // Points are absolute tile-local pixels, so the collider's own
      // offset stays zero. The convex warning is suppressed because a
      // concave shape is legal here — we triangulate it below.
      const polygon = Colliders.Polygon(points, Vector.Zero, true)
      if (polygon.checkConvex()) return [polygon]
      // Ear-clip into triangles and take them as individual colliders.
      // The `CompositeCollider` wrapper is deliberately discarded: the
      // tilemap re-offsets its members additively on every rebuild,
      // which would make a composite drift across the map.
      return triangles(polygon)
    }
  }
}

function triangles(polygon: PolygonCollider): Collider[] {
  try {
    return polygon.triangulate().getColliders()
  } catch {
    // Self-intersecting or otherwise un-clippable: fall back to the
    // polygon as given. It collides as its convex hull, which is a
    // worse shape but never a hole in the wall.
    return [polygon]
  }
}

/**
 * Replace `tile`'s colliders with the ones `shapes` describes.
 *
 * An empty `shapes` clears the tile back to "use my bounds", which is
 * the Wall case. Callers set `tile.solid` themselves — this function
 * never touches it, so solidity and shape stay one decision made in
 * `tile-collision.ts`.
 */
export function applyTileColliders(tile: Tile, shapes: readonly ColliderShape[]): void {
  tile.clearColliders()
  for (const shape of shapes) {
    for (const collider of tileCollidersFor(shape)) tile.addCollider(collider)
  }
}
