// Pure sizing math for {@link TilePalette} and everything that has to
// match its swatch geometry (the animation editor's preview frame renders
// the same sprite at the same on-screen size as the picker cells it is
// selected from). GTK-free so it can be unit-tested — the widget itself
// subclasses `Adw.Bin` and can't be imported under `gjsify test`.

/** Swatch rendering policy — see the `aspect-mode` property on `TilePalette`. */
export type TilePaletteAspectMode = 'fill' | 'contain'

/**
 * Fit a cell of aspect `width / height` into `size` on its LONGER axis:
 * 16×32 sprites at `size = 48` give 24×48, 32×16 give 48×24. A `null`
 * aspect (unknown / mixed sprite sizes) stays square.
 */
export function cellDimensions(size: number, aspect: number | null): [number, number] {
  if (aspect === null) return [size, size]
  if (aspect >= 1) return [size, Math.max(1, Math.round(size / aspect))]
  return [Math.max(1, Math.round(size * aspect)), size]
}

/**
 * Per-cell aspect (width / height) of a sprite sheet, read off its first
 * sprite — character sheets are uniform, so sprite 0 is representative.
 * `null` when there is no sprite or it has no height to divide by.
 */
export function cellAspectOf(sprite: { width: number; height: number } | undefined): number | null {
  return sprite && sprite.height > 0 ? sprite.width / sprite.height : null
}

/**
 * `[width, height]` of a single palette swatch. `fill` mode stays square
 * at `tileSize` (map tiles are uniform and the FlowBox cells are sized
 * identically); `contain` sizes the cell to the sheet's own aspect via
 * {@link cellDimensions} so a non-square sprite fills it undistorted.
 */
export function swatchDimensions(
  tileSize: number,
  aspectMode: TilePaletteAspectMode,
  cellAspect: number | null,
): [number, number] {
  if (aspectMode === 'fill') return [tileSize, tileSize]
  return cellDimensions(tileSize, cellAspect)
}

/**
 * `[min, max]` children-per-line for the palette's FlowBox.
 *
 * With `wrap` off both are pinned to `columns`, so the grid stays
 * rectangular and the host scrolls horizontally. With `wrap` on the min
 * drops to 1 and the max becomes `wrapCap` (NOT `columns`) — otherwise a
 * wide window stretches each cell to `width / columns` instead of fitting
 * as many fixed-size tiles per row as it can.
 */
export function linePolicy(columns: number, wrap: boolean, wrapCap: number): [number, number] {
  return wrap ? [1, wrapCap] : [columns, columns]
}
