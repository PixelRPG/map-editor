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
 * Which tile of `card` the surface point `point` falls on — the inverse
 * of {@link teleportEndpoint}, and the tile a drag-to-connect drop
 * means.
 *
 * Clamped into the map rather than rejected: a drop a few pixels past
 * the card's edge is a drop on the edge tile, not a miss, and the
 * caller has already decided this is the card it landed on. A card
 * drawn with no area falls back to tile (0, 0) so the result stays a
 * real tile instead of `NaN`.
 */
export function tileAtPoint(card: EndpointCard, point: OverlayPoint): { x: number; y: number } {
  const cols = Math.max(card.cols, 1)
  const rows = Math.max(card.rows, 1)
  const width = card.rect.w || 1
  const height = card.rect.h || 1
  const x = Math.floor(((point.x - card.rect.x) / width) * cols)
  const y = Math.floor(((point.y - card.rect.y) / height) * rows)
  return {
    x: Math.min(Math.max(x, 0), cols - 1),
    y: Math.min(Math.max(y, 0), rows - 1),
  }
}

/** A card the pointer can land on: its map id and the rect it was drawn in. */
export interface PlacedCard {
  mapId: string
  rect: SceneRect
}

/**
 * Which card the surface point `point` landed on, or `null` — the map a
 * drag-to-connect drop means.
 *
 * Searched from the END of the list because that is the order the cards
 * were put into the `Gtk.Fixed`, and a later child draws ON TOP of an
 * earlier one: when two cards overlap, the one the user sees under the
 * pointer is the last one that contains the point, not the first.
 */
export function cardAtPoint(cards: readonly PlacedCard[], point: OverlayPoint): string | null {
  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i]
    if (rectContains(card.rect, point)) return card.mapId
  }
  return null
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
 * Passes {@link clearOfRects} takes. A pill nudged off one card can land
 * on the next, so the walk repeats — but only a few times: past that the
 * label has been moved so far from its line that it no longer reads as
 * belonging to it, and trying the next point along the arc is better
 * than dragging this one further.
 */
const PILL_CLEARANCE_PASSES = 3

/** Whether two rects share any area, each inflated by `gap`. Touching edges do not count. */
export function rectsOverlap(a: SceneRect, b: SceneRect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w > b.x - gap && a.y < b.y + b.h + gap && a.y + a.h > b.y - gap
}

/** One label pill as it was placed, for {@link repeatsLabel}. */
export interface PlacedLabel {
  text: string
  rect: SceneRect
}

/**
 * Whether a pill saying `text` at `rect` would repeat one already
 * placed — the same words in the same place.
 *
 * Two doorway tiles side by side are two connections to one map, so
 * each line asks for a pill naming that map and the two land on top of
 * each other. The second says nothing the first did not, so it is
 * dropped; a second line to the same map from the far side of the atlas
 * keeps its own label, because there the name does answer "where does
 * THIS one go".
 */
export function repeatsLabel(placed: readonly PlacedLabel[], text: string, rect: SceneRect): boolean {
  return placed.some((other) => other.text === text && rectsOverlap(other.rect, rect))
}

/**
 * A label pill's centre, nudged clear of `obstacles` (the drawn card
 * rects) by the smallest displacement that frees it, keeping `gap` px of
 * air — or `null` when no nudge within {@link PILL_CLEARANCE_PASSES}
 * frees it.
 *
 * A connection's name pill is placed along its own curve (§ 6.2: at the
 * far end, beside the target), and between two cards that nearly touch
 * that point falls ON a card. Moving the pill, not the line, keeps the
 * label readable without bending the geometry that encodes where the
 * door actually goes.
 *
 * **`null` is a real answer, not a failure to report.** This used to
 * hand back the untouched curve point when the nudges ran out, and on
 * phone widths that is precisely what drew the two Link's Tree House
 * labels straight across the two Tree House cards, over the map
 * previews they were meant to annotate. § 6.2 shows names on demand and
 * puts the map's own name on its card, so a pill with nowhere to go is
 * worth less than the preview it would hide: the caller walks the arc
 * for another spot ({@link placeLabelOnCurve}) and otherwise drops the
 * label at this zoom.
 *
 * Deterministic: the obstacles are tested in order and the four
 * candidate escapes are compared by distance, up before down before
 * left before right on a tie.
 */
export function clearOfRects(
  centre: OverlayPoint,
  size: { w: number; h: number },
  obstacles: readonly SceneRect[],
  gap = 0,
  passes = PILL_CLEARANCE_PASSES,
): OverlayPoint | null {
  let at = centre
  for (let pass = 0; pass <= passes; pass += 1) {
    const pill: SceneRect = { x: at.x - size.w / 2, y: at.y - size.h / 2, w: size.w, h: size.h }
    const hit = obstacles.find((rect) => rect.w > 0 && rect.h > 0 && rectsOverlap(pill, rect, gap))
    if (!hit) return at
    if (pass === passes) break
    const escapes: OverlayPoint[] = [
      { x: 0, y: hit.y - gap - (pill.y + pill.h) },
      { x: 0, y: hit.y + hit.h + gap - pill.y },
      { x: hit.x - gap - (pill.x + pill.w), y: 0 },
      { x: hit.x + hit.w + gap - pill.x, y: 0 },
    ]
    let best = escapes[0]
    for (const candidate of escapes) {
      if (Math.abs(candidate.x) + Math.abs(candidate.y) < Math.abs(best.x) + Math.abs(best.y)) best = candidate
    }
    at = { x: at.x + best.x, y: at.y + best.y }
  }
  return null
}

/** How far along a line {@link placeLabelOnCurve} steps between tries. */
export const LABEL_ARC_STEP = 0.05

/**
 * How many steps it takes in each direction. Twenty at
 * {@link LABEL_ARC_STEP} covers the whole curve from either preferred
 * point, so a line always gets its full length offered before the label
 * is given up on.
 */
export const LABEL_ARC_TRIES = 20

/**
 * Where a pill of `size` naming this connection can sit on the curve
 * `a → control → b` without covering a card, or `null` when nowhere on
 * the line can hold it.
 *
 * `preferredT` is the spot § 6.2 asks for — beside the target, at the
 * far end — and it is tried first, so the common case of a line with
 * room around it is placed exactly where the section says. When that
 * spot is covered the walk steps along the arc, **towards the middle of
 * the line first**: the ends are on the cards by construction, so the
 * open air between them is the direction worth trying, and only after
 * it is exhausted does the walk try the other way. Each candidate point
 * still gets {@link clearOfRects}' nudge, which is what lets a label sit
 * just above or below the arc rather than only on it.
 *
 * Returning `null` means "do not draw this label at this zoom": the
 * cards carry their own names, the line is still there to be tapped,
 * and a pill laid over a map preview says less than the preview it
 * covers.
 */
export function placeLabelOnCurve(
  a: OverlayPoint,
  control: OverlayPoint,
  b: OverlayPoint,
  preferredT: number,
  size: { w: number; h: number },
  obstacles: readonly SceneRect[],
  gap = 0,
): OverlayPoint | null {
  // Towards 0.5, where the gap between the two cards is.
  const inward = preferredT > 0.5 ? -1 : 1
  for (let step = 0; step <= LABEL_ARC_TRIES; step += 1) {
    for (const direction of step === 0 ? [0] : [inward, -inward]) {
      const t = preferredT + direction * step * LABEL_ARC_STEP
      if (t < 0 || t > 1) continue
      const at = clearOfRects(pointOnQuad(a, control, b, t), size, obstacles, gap)
      if (at) return at
    }
  }
  return null
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
