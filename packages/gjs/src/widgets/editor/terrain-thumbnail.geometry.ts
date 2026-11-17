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
 * `width × height` box, centred.
 *
 * An UPSCALE is clamped to a whole factor, because the chip is the one
 * place a beginner looks at the pieces closely: at 1.17× a 16 px tile
 * grows every seventh column by a pixel and the shore line it is meant
 * to demonstrate comes out ragged. A downscale (a 32 px tileset in the
 * same chip) takes the fractional scale — a whole factor there would be
 * 0, i.e. nothing drawn.
 */
export function fitTerrainPatch(width: number, height: number, tilePx: number): TerrainPatchFit | null {
  if (width <= 0 || height <= 0 || tilePx <= 0) return null
  const box = Math.min(width, height)
  const scale = box / (TERRAIN_PATCH_CELLS * tilePx)
  const cell = scale >= 1 ? tilePx * Math.floor(scale) : Math.floor(box / TERRAIN_PATCH_CELLS)
  // Under three pixels there is no patch, only three slivers — the
  // caller draws nothing rather than something misleading.
  if (cell < 1) return null
  const patch = cell * TERRAIN_PATCH_CELLS
  return { cell, x: Math.floor((width - patch) / 2), y: Math.floor((height - patch) / 2) }
}
