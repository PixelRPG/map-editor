// Pure curve + marker geometry for {@link TeleportOverlay}: where a
// teleport's two ends sit on the atlas surface, how the quadratic Bézier
// between them bows, how several lines between the same two cards fan
// apart, where a line leaves the viewport, and how close the pointer is
// to one. GTK-free so it can be unit-tested — the overlay subclasses
// `Gtk.Widget` and only turns these numbers into `Gsk.PathBuilder` calls.

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

/** How far apart, as a fraction of the bow, two fanned lines sit. */
export const FAN_STEP = 0.45

/**
 * Multiplier on a connection's bow so several lines between the SAME
 * two cards stay tellable apart instead of stacking into one stroke.
 *
 * The spread is centred on the unfanned bow, so a lone line (the common
 * case) is left exactly where {@link controlPoint} put it and a pair
 * straddles it symmetrically. Past five lines the lowest factor turns
 * negative and that line bows to the other side — still distinct from
 * its neighbours, which is all the fan has to achieve.
 */
export function fanFactor(index: number, count: number): number {
  if (count <= 1) return 1
  return 1 + (index - (count - 1) / 2) * FAN_STEP
}

/**
 * {@link controlPoint} with its bow scaled by `factor` — the control
 * point a fanned line actually bends around.
 *
 * Scaling the offset from the midpoint rather than recomputing a bow
 * keeps the fan perpendicular to the chord at every factor, and a
 * `factor` of 1 reproduces {@link controlPoint} exactly, so the lone-line
 * case is untouched by the fan existing.
 */
export function fannedControl(a: OverlayPoint, b: OverlayPoint, factor: number): OverlayPoint {
  const base = controlPoint(a, b)
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  return { x: mx + (base.x - mx) * factor, y: my + (base.y - my) * factor }
}

/** Point at `t ∈ [0, 1]` on the quadratic Bézier `a → control → b`. */
export function pointOnQuad(a: OverlayPoint, control: OverlayPoint, b: OverlayPoint, t: number): OverlayPoint {
  const u = 1 - t
  const wa = u * u
  const wc = 2 * u * t
  const wb = t * t
  return {
    x: wa * a.x + wc * control.x + wb * b.x,
    y: wa * a.y + wc * control.y + wb * b.y,
  }
}

/**
 * Samples taken along a curve when hit-testing it. Twenty-four keeps a
 * full-surface line's sample spacing under a tile, which is finer than
 * the tolerance any pointer needs — and it runs per click, not per
 * frame.
 */
export const QUAD_HIT_SAMPLES = 24

/**
 * Approximate distance from `point` to the curve `a → control → b`, by
 * sampling.
 *
 * Exact nearest-point-on-a-quadratic means solving a cubic, and the
 * caller only wants to know whether a finger landed on this line rather
 * than the one next to it. Sampling over-reports by at most half a
 * sample spacing, which the caller's hit radius absorbs.
 */
export function distanceToQuad(
  a: OverlayPoint,
  control: OverlayPoint,
  b: OverlayPoint,
  point: OverlayPoint,
  samples = QUAD_HIT_SAMPLES,
): number {
  const steps = Math.max(1, Math.floor(samples))
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i <= steps; i++) {
    const at = pointOnQuad(a, control, b, i / steps)
    const distance = Math.hypot(at.x - point.x, at.y - point.y)
    if (distance < best) best = distance
  }
  return best
}

/** Whether `point` lies on or inside `rect`. */
export function rectContains(rect: SceneRect, point: OverlayPoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h
}

/**
 * Where the segment `a → b` leaves `viewport`, or `null` when it never
 * does — `a` is already outside, or `b` is inside too.
 *
 * This is the anchor for the edge chip that names an off-screen map
 * (REDESIGN.md § 6.2): the line runs off the visible atlas, and the chip
 * sits exactly where it goes. Liang–Barsky rather than four
 * segment-intersection tests, because it answers "which boundary first"
 * without ordering them by hand.
 */
export function clipToViewport(a: OverlayPoint, b: OverlayPoint, viewport: SceneRect): OverlayPoint | null {
  if (!rectContains(viewport, a) || rectContains(viewport, b)) return null
  const dx = b.x - a.x
  const dy = b.y - a.y
  let exit = 1
  // Each boundary gives the parameter at which the segment crosses it;
  // the first one still ahead of `a` is where the line leaves.
  const edges: Array<[number, number]> = [
    [-dx, a.x - viewport.x],
    [dx, viewport.x + viewport.w - a.x],
    [-dy, a.y - viewport.y],
    [dy, viewport.y + viewport.h - a.y],
  ]
  for (const [denominator, numerator] of edges) {
    if (denominator === 0) continue
    const t = numerator / denominator
    if (denominator > 0 && t < exit) exit = t
  }
  if (!(exit > 0 && exit < 1)) return null
  return { x: a.x + dx * exit, y: a.y + dy * exit }
}

/**
 * Far end of a broken door's stub: `length` px from the door, pointing
 * straight out of the card.
 *
 * Away from the centre rather than in the door's own facing direction,
 * because a door that goes nowhere has no direction — and a stub that
 * leans outwards reads as "this leads out of the map, and then stops".
 * A door exactly on the centre (a one-tile map) falls back to
 * downwards so the result stays finite.
 */
export function stubEnd(cardCentre: OverlayPoint, door: OverlayPoint, length: number): OverlayPoint {
  const dx = door.x - cardCentre.x
  const dy = door.y - cardCentre.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: door.x, y: door.y + length }
  return { x: door.x + (dx / len) * length, y: door.y + (dy / len) * length }
}
