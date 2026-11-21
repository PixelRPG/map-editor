/**
 * Pure zoom-report math shared by {@link EngineController}. Kept free of
 * any `@pixelrpg/gjs` / `gi://` import so it can be unit-tested under the
 * node target (the controller itself wraps the gi-bound engine widget and
 * can't run headlessly).
 */

/** Default zoom-report dead-band — see {@link shouldReportZoomChange}. */
export const ZOOM_REPORT_DEAD_BAND = 0.01

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
