/**
 * Pure camera-zoom math shared by {@link EngineController}. Kept free of
 * any `@pixelrpg/gjs` / `gi://` import so it can be unit-tested under the
 * node target (the controller itself wraps the gi-bound engine widget and
 * can't run headlessly).
 */

/** Camera zoom is clamped to this range (1 = 100%). */
export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 4

/** Default zoom-report dead-band — see {@link shouldReportZoomChange}. */
export const ZOOM_REPORT_DEAD_BAND = 0.01

/**
 * Bump `currentZoom` by `delta` and snap the result to the engine's
 * scroll-wheel-zoom granularity: rounded to one decimal and clamped to
 * `[ZOOM_MIN, ZOOM_MAX]`.
 *
 * The rounding is lossy by design — stepping is quantised so the OSD reads
 * clean tenths, which means repeated `calculateNextZoom` calls do NOT equal
 * `initial + Σdeltas`; each step rounds independently.
 */
export function calculateNextZoom(currentZoom: number, delta: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((currentZoom + delta) * 10) / 10))
}

/**
 * Whether a new camera zoom is far enough from the last reported value to
 * be worth re-emitting — a dead-band that stops sub-`deadBand` floating
 * point drift from spamming the OSD label. Reports when the absolute
 * change is `>= deadBand` (so a change of exactly the band edge reports).
 */
export function shouldReportZoomChange(
  newZoom: number,
  lastReportedZoom: number,
  deadBand = ZOOM_REPORT_DEAD_BAND,
): boolean {
  return Math.abs(newZoom - lastReportedZoom) >= deadBand
}
