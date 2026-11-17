// The GTK-free half of `PixelRpgTerrainThumbnail`: how a 3×3 sample of
// a terrain is laid out inside a square box. Kept apart from the widget
// so "a 48 px chip shows 16 px tiles at 1×, and a 56 px chip still shows
// them at 1× rather than at 1.17×" is a unit test under the node target
// rather than a screenshot.

/** Cells across the sample patch — mirrors the engine's `TERRAIN_PREVIEW_SIZE`. */
export const TERRAIN_PATCH_CELLS = 3

/**
 * Side (px) of a brush chip's patch. Three 16 px tiles at 1×, which is
 * what REDESIGN § 5.3's 56 px chip has room for once the chip's own
 * padding is taken off.
 */
export const TERRAIN_THUMB_PX = 48

/** Where one cell of the patch lands, and how big it is drawn. */
export interface TerrainPatchFit {
  /** Side of one drawn cell. */
  readonly cell: number
  /** Left/top offset of the whole patch inside the box, centring it. */
  readonly x: number
  readonly y: number
}

/**
 * Fit a {@link TERRAIN_PATCH_CELLS}² patch of `tilePx` tiles into a
 * `width × height` box, centred — {@link fitTerrainGrid} for the square
 * case the brush chips are.
 *
 * An UPSCALE is clamped to a whole factor, because the chip is the one
 * place a beginner looks at the pieces closely: at 1.17× a 16 px tile
 * grows every seventh column by a pixel and the shore line it is meant
 * to demonstrate comes out ragged. A downscale (a 32 px tileset in the
 * same chip) takes the fractional scale — a whole factor there would be
 * 0, i.e. nothing drawn.
 */
export function fitTerrainPatch(width: number, height: number, tilePx: number): TerrainPatchFit | null {
  return fitTerrainGrid(width, height, tilePx, TERRAIN_PATCH_CELLS, TERRAIN_PATCH_CELLS)
}

/**
 * The same rule for a grid of any shape: the definition dialog's sample
 * is 14×10 rather than 3×3, and it has to scale the way the chip does
 * or the two pictures of one brush disagree about what its pieces look
 * like.
 *
 * Both axes are measured, so a wide grid in a tall box is limited by
 * the width — the chip's `Math.min(width, height)` was only ever the
 * square case of that.
 */
export function fitTerrainGrid(
  width: number,
  height: number,
  tilePx: number,
  cols: number,
  rows: number,
): TerrainPatchFit | null {
  if (width <= 0 || height <= 0 || tilePx <= 0 || cols <= 0 || rows <= 0) return null
  const scale = Math.min(width / (cols * tilePx), height / (rows * tilePx))
  const cell = scale >= 1 ? tilePx * Math.floor(scale) : Math.floor(Math.min(width / cols, height / rows))
  // Under a pixel a cell there is no grid, only slivers — the caller
  // draws nothing rather than something misleading.
  if (cell < 1) return null
  return {
    cell,
    x: Math.floor((width - cell * cols) / 2),
    y: Math.floor((height - cell * rows) / 2),
  }
}
