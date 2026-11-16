/**
 * The arithmetic behind the Full-view tile shape editor — the free-form
 * half of per-tile collision (REDESIGN.md § 6.4).
 *
 * The pictogram presets in {@link ./tile-collision.ts} cover the shapes
 * a tileset author picks; this module covers the ones they draw. A
 * drag on the magnified tile becomes a {@link ColliderShape} here, and
 * only here: the dialog widget owns pointer events and gettext strings,
 * never the geometry, so "what did that drag mean?" is unit-tested
 * without a display.
 *
 * Everything is in **tile-local pixels**, the same space
 * `definition.colliders` is stored in and the same space the hatch
 * reads — a 16 px tile spans x ∈ [0, 16] whatever zoom the canvas
 * happens to draw it at. Coordinates are whole pixels: a collider that
 * lands between two source pixels would render one way in the editor
 * and mesh another way in the engine.
 */

import type { ColliderShape } from '../types/data/index.ts'

/** A point in tile-local pixels. */
export interface ShapePoint {
  x: number
  y: number
}

/** The tile's own pixel grid — the bounds every drawn point is clamped to. */
export interface TilePixelSize {
  width: number
  height: number
}

/** The axis-aligned box a shape occupies, in tile-local pixels. */
export interface ShapeBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * How close to the first point a click has to land to close a polygon,
 * in tile-local pixels. Generous on purpose: on a 16 px tile magnified
 * to a dialog, one tile pixel is a large target, and the alternative to
 * closing is an accidental extra vertex.
 */
export const POLYGON_CLOSE_DISTANCE = 1.5

/**
 * Snap a point to the tile's pixel grid and clamp it into the tile.
 *
 * Rounds to pixel *corners*, not centres: a rectangle is described by
 * the grid lines it runs along, so dragging from the top-left corner
 * one pixel right and down has to yield exactly `1 × 1`.
 */
export function snapToTile(point: ShapePoint, size: TilePixelSize): ShapePoint {
  return {
    x: clamp(Math.round(point.x), 0, size.width),
    y: clamp(Math.round(point.y), 0, size.height),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * The rectangle spanned by two snapped corners, or `null` when the drag
 * collapsed to a line or a point — a zero-width collider blocks nothing
 * and would show up in the shape list as an invisible entry.
 */
export function rectangleBetween(a: ShapePoint, b: ShapePoint): ColliderShape | null {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const width = Math.abs(a.x - b.x)
  const height = Math.abs(a.y - b.y)
  if (width <= 0 || height <= 0) return null
  return { type: 'rectangle', width, height, offset: { x, y } }
}

/**
 * The circle around `centre` reaching `edge`, or `null` below a one
 * pixel radius.
 *
 * The radius is NOT clamped to the tile: a round blocker that bulges
 * past the tile edge is a legitimate shape (a tree trunk whose base
 * overlaps the neighbour), and Excalibur places colliders in world
 * space, not clipped to the cell.
 */
export function circleBetween(centre: ShapePoint, edge: ShapePoint): ColliderShape | null {
  const radius = Math.round(Math.hypot(edge.x - centre.x, edge.y - centre.y))
  if (radius < 1) return null
  return { type: 'circle', radius, offset: { x: centre.x, y: centre.y } }
}

/**
 * The polygon through `points`, or `null` when fewer than three
 * distinct corners survive.
 *
 * Consecutive duplicates are dropped — a click that lands on the pixel
 * just placed is a double-click, not a zero-length edge — and so is a
 * closing point repeating the first, because the shape is implicitly
 * closed.
 */
export function polygonOf(points: readonly ShapePoint[]): ColliderShape | null {
  const corners = dedupe(points)
  if (corners.length >= 2 && samePoint(corners[0]!, corners[corners.length - 1]!)) corners.pop()
  if (corners.length < 3) return null
  return { type: 'polygon', points: corners }
}

function dedupe(points: readonly ShapePoint[]): ShapePoint[] {
  const out: ShapePoint[] = []
  for (const point of points) {
    const last = out[out.length - 1]
    if (last && samePoint(last, point)) continue
    out.push({ x: point.x, y: point.y })
  }
  return out
}

function samePoint(a: ShapePoint, b: ShapePoint): boolean {
  return a.x === b.x && a.y === b.y
}

/**
 * Whether a click at `candidate` closes the polygon in progress — three
 * corners already placed and the click back on the first one.
 */
export function closesPolygon(points: readonly ShapePoint[], candidate: ShapePoint): boolean {
  const first = points[0]
  if (!first || points.length < 3) return false
  return Math.hypot(candidate.x - first.x, candidate.y - first.y) <= POLYGON_CLOSE_DISTANCE
}

/**
 * The box a shape occupies, or `null` for a polygon with no points.
 *
 * A circle without an offset is centred on the tile and a rectangle
 * without one sits at the top-left — the defaults the engine itself
 * applies, kept in one place so the editor, the shape list and the wall
 * hatch all agree on where an under-specified shape is.
 */
export function shapeBounds(shape: ColliderShape, size: TilePixelSize): ShapeBounds | null {
  if (shape.type === 'rectangle') {
    return { x: shape.offset?.x ?? 0, y: shape.offset?.y ?? 0, width: shape.width, height: shape.height }
  }
  if (shape.type === 'circle') {
    const cx = shape.offset?.x ?? size.width / 2
    const cy = shape.offset?.y ?? size.height / 2
    return { x: cx - shape.radius, y: cy - shape.radius, width: shape.radius * 2, height: shape.radius * 2 }
  }
  if (shape.points.length === 0) return null
  const xs = shape.points.map((p) => p.x)
  const ys = shape.points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/**
 * Whether the tile pixel at column `x`, row `y` is inside any shape.
 *
 * Tested at the pixel's centre, which is what makes the answer
 * unambiguous on a shared edge: two rectangles meeting at `x = 8`
 * cover the pixels either side of the seam and neither claims a
 * zero-width sliver of the other.
 *
 * This is the editor's "would the hero bump here?" readout, which is
 * why it takes the real shapes rather than the bounding boxes the wall
 * hatch settles for at tileset zoom.
 */
export function isPixelBlocked(shapes: readonly ColliderShape[], x: number, y: number, size: TilePixelSize): boolean {
  const cx = x + 0.5
  const cy = y + 0.5
  return shapes.some((shape) => containsPoint(shape, cx, cy, size))
}

function containsPoint(shape: ColliderShape, x: number, y: number, size: TilePixelSize): boolean {
  if (shape.type === 'rectangle') {
    const ox = shape.offset?.x ?? 0
    const oy = shape.offset?.y ?? 0
    return x >= ox && x <= ox + shape.width && y >= oy && y <= oy + shape.height
  }
  if (shape.type === 'circle') {
    const cx = shape.offset?.x ?? size.width / 2
    const cy = shape.offset?.y ?? size.height / 2
    return Math.hypot(x - cx, y - cy) <= shape.radius
  }
  return isInsidePolygon(shape.points, x, y)
}

/**
 * Even-odd ray casting: count the polygon edges a ray to the right of
 * the point crosses. Handles the concave outlines the triangulation in
 * `MapResource` turns into individual triangle colliders.
 */
function isInsidePolygon(points: readonly ShapePoint[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!
    const b = points[j]!
    const straddles = a.y > y !== b.y > y
    if (!straddles) continue
    const crossing = ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    if (x < crossing) inside = !inside
  }
  return inside
}

/** The shape list without the entry at `index`; unchanged for an index it does not hold. */
export function removeShapeAt(shapes: readonly ColliderShape[], index: number): ColliderShape[] {
  if (index < 0 || index >= shapes.length) return [...shapes]
  return shapes.filter((_, i) => i !== index)
}
