// Pure sizing and hit-test math for {@link TileSheet}, the palette that
// draws a tileset as the CONTIGUOUS picture it is instead of a wrapped
// grid of detached swatches. GTK-free so it can be unit-tested — the
// widget itself subclasses `Gtk.Widget` and can't be imported under
// `gjsify test`.
//
// Every length here is in SOURCE pixels unless the name says `scale`:
// the widget scales once, at draw time, by an integer factor, so the
// nearest-neighbour upscale never lands a tile edge on a half pixel.

/**
 * The regular grid a sprite sheet lays its tiles out on — the geometry
 * half of `SpriteSetData`, plus the texture's real size.
 *
 * `margin` is the border around the whole grid, `spacing` the gutter
 * between neighbouring tiles. Both are 0 in every sheet the editor ships,
 * but a hand-made sheet may use them, and a click in a gutter is a miss
 * rather than a rounded-to-nearest hit.
 */
export interface SheetGrid {
  columns: number
  rows: number
  tileWidth: number
  tileHeight: number
  margin: number
  spacing: number
  imageWidth: number
  imageHeight: number
}

/**
 * The sprite-sheet fields a grid is built from — structurally the geometry
 * half of `SpriteSetData`, spelled out here so this module stays free of
 * `@pixelrpg/engine` (and of anything that drags Excalibur in under test).
 */
export interface SheetLayout {
  columns: number
  rows: number
  spriteWidth: number
  spriteHeight: number
  margin?: number
  spacing?: number
}

/** A rectangular block of tiles, as a top-left cell plus an extent. */
export interface SheetSpan {
  col: number
  row: number
  columns: number
  rows: number
}

/**
 * A multi-tile pick: the block that was dragged, plus the tiles it
 * covers row-major (see {@link indicesOfSpan}, so `-1` is a hole).
 *
 * The indices are SHEET-local — the host adds the tileset's `firstGid`
 * to reach the engine's global ids, exactly as it does for a single
 * tile pick.
 */
export interface SheetStampPick {
  span: SheetSpan
  indices: number[]
}

/** A rectangle in WIDGET space (source pixels times the draw scale). */
export interface SheetRect {
  x: number
  y: number
  width: number
  height: number
}

/** The on-screen edge a 16 px tile should reach — §5.3's "3×". */
export const SHEET_TARGET_TILE = 48

/**
 * The integer factor that brings the sheet's SMALLER tile axis closest to
 * `target`: 16 px tiles at 48 give 3×, 32 px tiles give 2× (48/32 = 1.5
 * rounds up), 48 px tiles give 1×.
 *
 * Integer-only because the whole point of drawing the sheet as one
 * texture is a crisp nearest-neighbour upscale; 1.5× would smear every
 * other pixel row no matter the filter. Never below 1 — shrinking a
 * tileset to fit is worse than panning it.
 */
export function sheetScale(tileWidth: number, tileHeight: number, target: number = SHEET_TARGET_TILE): number {
  const shorter = Math.min(tileWidth, tileHeight)
  if (!(shorter > 0)) return 1
  return Math.max(1, Math.round(target / shorter))
}

/**
 * Join a sprite set's layout to its texture's real size. The image size
 * has to come from the texture rather than from `columns * spriteWidth`,
 * because only the texture knows about trailing pixels — and every caller
 * already holds the texture it is about to draw.
 */
export function sheetGridOf(layout: SheetLayout, imageWidth: number, imageHeight: number): SheetGrid {
  return {
    columns: layout.columns,
    rows: layout.rows,
    tileWidth: layout.spriteWidth,
    tileHeight: layout.spriteHeight,
    margin: layout.margin ?? 0,
    spacing: layout.spacing ?? 0,
    imageWidth,
    imageHeight,
  }
}

/** How many tiles the grid addresses, gutters excluded. */
export function tileCount(grid: SheetGrid): number {
  return Math.max(0, grid.columns) * Math.max(0, grid.rows)
}

/**
 * The widget size that shows the whole sheet at `scale`.
 *
 * Measured from the TEXTURE, not from `columns * tileWidth`: a sheet
 * whose image carries a few trailing pixels keeps them, so what the
 * palette shows is what the file holds.
 */
export function sheetSize(grid: SheetGrid, scale: number): [number, number] {
  return [Math.max(0, Math.round(grid.imageWidth * scale)), Math.max(0, Math.round(grid.imageHeight * scale))]
}

/** The distance from one tile's left edge to the next one's, in source pixels. */
function strideOf(tile: number, spacing: number): number {
  return tile + spacing
}

/** Which cell `offset` (source pixels, grid-relative) falls in, or `null` in a gutter. */
function cellAt(offset: number, tile: number, spacing: number, count: number): number | null {
  if (offset < 0 || tile <= 0 || count <= 0) return null
  const stride = strideOf(tile, spacing)
  const cell = Math.floor(offset / stride)
  if (cell >= count) return null
  // Past the tile but short of the next one: the user hit the gutter.
  if (offset - cell * stride >= tile) return null
  return cell
}

/**
 * The tile index under widget-space `(x, y)`, or `null` for a point in a
 * margin, in a gutter, or past the grid.
 *
 * Returning `null` rather than clamping is deliberate: a tap in a sheet's
 * dead space arms nothing, which is honest, where a clamp would arm the
 * tile the user did not aim at.
 */
export function tileIndexAt(grid: SheetGrid, scale: number, x: number, y: number): number | null {
  if (scale <= 0) return null
  const col = cellAt(x / scale - grid.margin, grid.tileWidth, grid.spacing, grid.columns)
  if (col === null) return null
  const row = cellAt(y / scale - grid.margin, grid.tileHeight, grid.spacing, grid.rows)
  if (row === null) return null
  return row * grid.columns + col
}

/** The widget-space rectangle of one tile, or `null` for an index off the grid. */
export function tileRectOf(grid: SheetGrid, scale: number, index: number): SheetRect | null {
  return spanRect(grid, scale, spanOfIndex(grid, index))
}

/** The one-tile span at `index`, or `null` when the index is off the grid. */
export function spanOfIndex(grid: SheetGrid, index: number): SheetSpan | null {
  if (!Number.isInteger(index) || index < 0 || index >= tileCount(grid)) return null
  return { col: index % grid.columns, row: Math.floor(index / grid.columns), columns: 1, rows: 1 }
}

/**
 * The smallest block of tiles covering both `from` and `to` — the
 * rectangle a marquee drag selects, in either direction.
 */
export function spanBetween(grid: SheetGrid, from: number, to: number): SheetSpan | null {
  const a = spanOfIndex(grid, from)
  const b = spanOfIndex(grid, to)
  if (!a || !b) return null
  const col = Math.min(a.col, b.col)
  const row = Math.min(a.row, b.row)
  return {
    col,
    row,
    columns: Math.abs(a.col - b.col) + 1,
    rows: Math.abs(a.row - b.row) + 1,
  }
}

/**
 * The widget-space rectangle a span covers, interior gutters included —
 * what the accent ring is drawn around.
 */
export function spanRect(grid: SheetGrid, scale: number, span: SheetSpan | null): SheetRect | null {
  if (!span) return null
  const extent = (cells: number, tile: number) => cells * tile + Math.max(0, cells - 1) * grid.spacing
  return {
    x: (grid.margin + span.col * strideOf(grid.tileWidth, grid.spacing)) * scale,
    y: (grid.margin + span.row * strideOf(grid.tileHeight, grid.spacing)) * scale,
    width: extent(span.columns, grid.tileWidth) * scale,
    height: extent(span.rows, grid.tileHeight) * scale,
  }
}

/**
 * The top-left tile of a span — the anchor the stamp lands on, and the
 * one tile a 1×1 pick arms.
 */
export function firstIndexOfSpan(grid: SheetGrid, span: SheetSpan | null): number | null {
  if (!span || span.col < 0 || span.row < 0 || span.col >= grid.columns || span.row >= grid.rows) return null
  return span.row * grid.columns + span.col
}

/**
 * Every tile a span covers, row-major — the stamp a marquee drag arms.
 *
 * A cell that addresses no tile (the span reaches past the grid) is `-1`
 * rather than dropped, so the returned list stays `columns * rows` long
 * and the block keeps its shape: the engine's stamp model reads a
 * non-positive id as a HOLE it skips, which is exactly what a cell
 * outside the sheet should paint. An empty list means the span itself is
 * unusable.
 */
export function indicesOfSpan(grid: SheetGrid, span: SheetSpan | null): number[] {
  if (!span || span.columns < 1 || span.rows < 1) return []
  const indices: number[] = []
  for (let row = span.row; row < span.row + span.rows; row++) {
    for (let col = span.col; col < span.col + span.columns; col++) {
      const onGrid = col >= 0 && col < grid.columns && row >= 0 && row < grid.rows
      indices.push(onGrid ? row * grid.columns + col : -1)
    }
  }
  return indices
}
