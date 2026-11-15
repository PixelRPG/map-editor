// Pure curve + marker geometry for {@link TeleportOverlay}: where a
// teleport's two ends sit on the atlas surface, how the quadratic Bézier
// between them bows, and how the destination arrowhead is oriented.
// GTK-free so it can be unit-tested — the overlay subclasses `Gtk.Widget`
// and only turns these numbers into `Gsk.PathBuilder` calls.

import type { SceneRect } from './atlas-canvas.geometry.ts'

/** A point on the atlas surface, in surface pixels. */
export interface OverlayPoint {
  x: number
  y: number
}

/**
 * One card as the overlay sees it: the body rect the atlas camera
 * actually drew (surface px) plus the map's tile dimensions.
 */
export interface EndpointCard {
  rect: SceneRect
  cols: number
  rows: number
}

/** Largest perpendicular bow (px) of a teleport curve. */
export const CURVE_OFFSET_MAX = 80

/** Bow as a fraction of the endpoint distance, until it hits the cap. */
export const CURVE_OFFSET_FACTOR = 0.25

/**
 * Centre of tile `(tile.x, tile.y)` on the atlas surface.
 *
 * The tile is placed as a FRACTION of the card's drawn body rect rather
 * than from a tile size of its own: the card is the whole map scaled to
 * whatever the camera decided (zoom, plus the minimum-card floor), so
 * the body rect is the only thing that knows the real pixels-per-tile.
 * That also keeps the endpoint off the title, which sits outside the
 * body rect. The `+ 0.5` centres the marker in its tile.
 */
export function teleportEndpoint(card: EndpointCard, tile: { x: number; y: number }): OverlayPoint {
  const cols = Math.max(card.cols, 1)
  const rows = Math.max(card.rows, 1)
  return {
    x: card.rect.x + ((tile.x + 0.5) / cols) * card.rect.w,
    y: card.rect.y + ((tile.y + 0.5) / rows) * card.rect.h,
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
