/**
 * The zoom levels pixel art may be drawn at, and how to land on one.
 *
 * Lives in the engine rather than beside the GTK gesture that first
 * needed it: the pixel grid is a property of the tiles, not of the
 * input device. A run picks its opening zoom from these levels
 * (`play-camera.ts`), a pinch springs to one when the fingers leave
 * (`pinch-zoom.ts` in `@pixelrpg/gjs`), and a second copy of the
 * arithmetic in either place would be free to drift from the other.
 */

/** Zoom bounds a snap is allowed to land in. Mirrors `EDITOR_CONSTANTS`. */
export interface ZoomRange {
  readonly min: number
  readonly max: number
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
  if (levels.length === 0) levels.push(clampZoom(1, range))
  return levels
}

/**
 * Spring a free-floating zoom to the nearest whole-pixel level.
 *
 * Nearest is measured in LOG space, not linear: 1.5 sits visually
 * halfway between 1 and 2, but linear distance would call it closer to
 * 2 (0.5 vs 0.5 — a tie that rounds up) and, worse, would treat 0.75 as
 * far nearer to 1 than to 0.5 even though it is one and a half times
 * either. Zoom is multiplicative, so the metric has to be too.
 */
export function snapZoomToWholePixel(zoom: number, range: ZoomRange): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return clampZoom(1, range)
  const target = clampZoom(zoom, range)
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

/** Hold a zoom inside its range. */
export function clampZoom(zoom: number, range: ZoomRange): number {
  return Math.min(range.max, Math.max(range.min, zoom))
}
