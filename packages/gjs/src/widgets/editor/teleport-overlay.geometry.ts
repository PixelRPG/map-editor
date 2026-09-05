// Pure curve + marker geometry for {@link TeleportOverlay}: where a
// teleport's two ends sit on the atlas surface, how the quadratic Bézier
// between them bows, and how the destination arrowhead is oriented.
// GTK-free so it can be unit-tested — the overlay subclasses `Gtk.Widget`
// and only turns these numbers into `Gsk.PathBuilder` calls.

/** A point on the atlas surface, in surface pixels. */
export interface OverlayPoint {
  x: number
  y: number
}

/** The scene fields an endpoint reads — `SampleScene` satisfies it. */
export interface EndpointScene {
  x: number
  y: number
  tilePx: number
}

/** Largest perpendicular bow (px) of a teleport curve. */
export const CURVE_OFFSET_MAX = 80

/** Bow as a fraction of the endpoint distance, until it hits the cap. */
export const CURVE_OFFSET_FACTOR = 0.25

/**
 * Centre of tile `(tileX, tileY)` of `scene` on the atlas surface.
 *
 * The `+ 0.5` puts the marker in the middle of the tile rather than its
 * top-left corner, and `titleBarHeight` skips the card's header strip so
 * the endpoint lands on the map, not on the title.
 */
export function teleportEndpoint(
  scene: EndpointScene,
  tileX: number,
  tileY: number,
  scale: number,
  titleBarHeight: number,
): OverlayPoint {
  return {
    x: (scene.x + (tileX + 0.5) * scene.tilePx) * scale,
    y: (scene.y + (tileY + 0.5) * scene.tilePx) * scale + titleBarHeight,
  }
}

/**
 * Quadratic-Bézier control point, offset perpendicular to the segment
 * midpoint by `min(CURVE_OFFSET_MAX, length × CURVE_OFFSET_FACTOR)`.
 *
 * Two teleports between the same pair of scenes therefore bow the same
 * way, and coincident endpoints (a self-teleport onto its own tile)
 * fall back to a unit length so the result stays finite instead of
 * poisoning the path with NaN.
 */
export function controlPoint(a: OverlayPoint, b: OverlayPoint): OverlayPoint {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const off = Math.min(CURVE_OFFSET_MAX, len * CURVE_OFFSET_FACTOR)
  return { x: mx - (dy / len) * off, y: my + (dx / len) * off }
}

/**
 * The three corners of the destination arrowhead: the tip, then the two
 * base corners, in path order.
 *
 * `from` is the curve's control point — a quadratic Bézier's tangent at
 * `t = 1` runs control → end, so the arrow points along the curve rather
 * than along the straight chord.
 */
export function arrowheadPoints(
  from: OverlayPoint,
  tip: OverlayPoint,
  size: number,
): [OverlayPoint, OverlayPoint, OverlayPoint] {
  const dx = tip.x - from.x
  const dy = tip.y - from.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // Perpendicular unit vector for the two base corners.
  const px = -uy
  const py = ux
  const half = size * 0.6
  const baseX = tip.x - ux * size
  const baseY = tip.y - uy * size
  return [
    { x: tip.x, y: tip.y },
    { x: baseX + px * half, y: baseY + py * half },
    { x: baseX - px * half, y: baseY - py * half },
  ]
}
