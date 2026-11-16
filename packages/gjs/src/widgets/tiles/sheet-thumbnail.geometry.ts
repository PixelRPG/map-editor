// Pure fit math for {@link SheetThumbnail}: where a sprite sheet lands
// inside a thumbnail box, and which scaling filter that landing asks
// for. GTK-free so it can be unit-tested — the widget itself subclasses
// `Gtk.Widget` and can't be imported under `gjsify test`.

/** How a sheet is laid down in a thumbnail box. */
export interface SheetThumbPlacement {
  /** Box-space rectangle the sheet is drawn into, centred. */
  x: number
  y: number
  width: number
  height: number
  /** The factor the source was multiplied by. */
  scale: number
  /**
   * True when {@link scale} is a whole number ≥ 1 and the sheet must be
   * drawn with a nearest-neighbour filter; false when it is a downscale
   * that wants a linear/trilinear one.
   */
  nearest: boolean
}

/**
 * Fit the WHOLE sheet into a `boxWidth` × `boxHeight` thumbnail,
 * centred and aspect-preserving, and say which filter § 7 asks for at
 * the resulting factor:
 *
 * - **Upscale** (a sheet smaller than the box) is clamped to a WHOLE
 *   factor and drawn nearest-neighbour. 1.5× would smear every other
 *   pixel row of pixel art no matter the filter, so a 48 px sheet in a
 *   160 px box is drawn at 3×, not 3.33×, and keeps the slack as margin.
 * - **Downscale** has no whole factor to land on, so it takes the exact
 *   fractional one with a linear filter — the readable-mosaic case this
 *   thumbnail exists for.
 *
 * Returns `null` for an empty box or an empty sheet; a caller with
 * nothing to draw should draw nothing rather than a degenerate rect.
 */
export function fitSheetThumbnail(
  boxWidth: number,
  boxHeight: number,
  sheetWidth: number,
  sheetHeight: number,
): SheetThumbPlacement | null {
  if (!(boxWidth > 0) || !(boxHeight > 0) || !(sheetWidth > 0) || !(sheetHeight > 0)) return null
  const fit = Math.min(boxWidth / sheetWidth, boxHeight / sheetHeight)
  const nearest = fit >= 1
  const scale = nearest ? Math.floor(fit) : fit
  const width = sheetWidth * scale
  const height = sheetHeight * scale
  // Whole-pixel offsets: a half-pixel origin re-introduces the blurred
  // tile edges the integer factor was chosen to avoid.
  return {
    x: Math.round((boxWidth - width) / 2),
    y: Math.round((boxHeight - height) / 2),
    width,
    height,
    scale,
    nearest,
  }
}
