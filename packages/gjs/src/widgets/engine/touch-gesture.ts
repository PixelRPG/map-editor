/**
 * Pure decision logic for the canvas touch gestures.
 *
 * GTK can only be driven by a real finger, and the headless capture
 * harness has no way to inject one — so the arithmetic that decides how
 * far the camera moves and where the zoom lands lives here, free of
 * `gi://`, and the unit tests are the proof. `pinch-zoom.ts` stays a
 * thin adapter: read the gesture, call these, write the camera.
 *
 * See `docs/design/ui-redesign/REDESIGN.md` § 5.5 for the gesture table
 * these implement.
 */

/** Zoom bounds the snap is allowed to land in. Mirrors `EDITOR_CONSTANTS`. */
export interface ZoomRange {
  readonly min: number
  readonly max: number
}

/**
 * The zoom and bounding-box centre a two-finger gesture started from.
 * Scale arrives from GTK as a factor against `begin`, never as a delta,
 * so the starting zoom has to be remembered rather than read live — see
 * the compounding note in `pinch-zoom.ts`.
 */
export interface TwoFingerState {
  readonly zoomAtBegin: number
  readonly centreX: number
  readonly centreY: number
}

/** What the widget should do for one `Gtk.Gesture::update`. */
export interface TwoFingerStep {
  /** Target camera zoom, already clamped. */
  readonly zoom: number
  /** Widget-local point to hold still while scaling. */
  readonly anchorX: number
  readonly anchorY: number
  /** Screen-pixel translation of the finger midpoint since the last step. */
  readonly panX: number
  readonly panY: number
  /** Carry this into the next call. */
  readonly state: TwoFingerState
}

/** Seed the state when `Gtk.Gesture::begin` fires. */
export function beginTwoFinger(zoom: number, centreX: number, centreY: number): TwoFingerState {
  return {
    zoomAtBegin: zoom > 0 && Number.isFinite(zoom) ? zoom : 1,
    centreX,
    centreY,
  }
}

/**
 * Fold one gesture update into a camera move.
 *
 * Scale and translation are reported by the SAME two contacts, so both
 * have to come out of one step: zoom about the midpoint first (which
 * pins the world point under the fingers), then translate by however
 * far that midpoint itself travelled. Doing only the first gives pinch
 * without two-finger pan; doing only the second gives pan that slides
 * the map out from under the pinch.
 */
export function stepTwoFinger(
  state: TwoFingerState,
  scale: number,
  centreX: number,
  centreY: number,
  range: ZoomRange,
): TwoFingerStep {
  const usableScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  const zoom = clamp(state.zoomAtBegin * usableScale, range.min, range.max)
  return {
    zoom,
    anchorX: centreX,
    anchorY: centreY,
    panX: centreX - state.centreX,
    panY: centreY - state.centreY,
    state: { zoomAtBegin: state.zoomAtBegin, centreX, centreY },
  }
}

/**
 * The zoom levels at which a source pixel covers a whole number of
 * screen pixels: the integers, plus `1/n` for zooming out, where one
 * screen pixel covers `n` source pixels evenly.
 *
 * Anything between them resamples 16 px tiles onto a fractional grid,
 * which is what makes pinched pixel art shimmer and makes the one-pixel
 * tile seams appear and disappear along a row.
 */
export function wholePixelZoomLevels(range: ZoomRange): readonly number[] {
  const levels: number[] = []
  for (let divisor = Math.max(1, Math.ceil(1 / Math.max(range.min, Number.EPSILON))); divisor >= 2; divisor--) {
    const level = 1 / divisor
    if (level >= range.min && level <= range.max) levels.push(level)
  }
  for (let factor = 1; factor <= Math.floor(range.max); factor++) {
    if (factor >= range.min && factor <= range.max) levels.push(factor)
  }
  if (levels.length === 0) levels.push(clamp(1, range.min, range.max))
  return levels
}

/**
 * Spring a free-floating pinch zoom to the nearest whole-pixel level.
 *
 * Nearest is measured in LOG space, not linear: 1.5 sits visually
 * halfway between 1 and 2, but linear distance would call it closer to
 * 2 (0.5 vs 0.5 — a tie that rounds up) and, worse, would treat 0.75 as
 * far nearer to 1 than to 0.5 even though it is one and a half times
 * either. Zoom is multiplicative, so the metric has to be too.
 */
export function snapZoomToWholePixel(zoom: number, range: ZoomRange): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return clamp(1, range.min, range.max)
  const target = clamp(zoom, range.min, range.max)
  const levels = wholePixelZoomLevels(range)
  let best = levels[0] as number
  let bestDistance = Number.POSITIVE_INFINITY
  for (const level of levels) {
    const distance = Math.abs(Math.log(level) - Math.log(target))
    if (distance < bestDistance) {
      bestDistance = distance
      best = level
    }
  }
  return best
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
