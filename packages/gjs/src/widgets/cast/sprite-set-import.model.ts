// Pure slicing + naming rules behind the sprite-set import dialog: how an
// image divides into a uniform grid, where a cell sits in it, and how a
// display name becomes an id. GTK-free so it can be unit-tested (the
// dialog subclasses `Adw.Dialog`).

/** A uniform sprite grid sliced out of a source image. */
export interface SpriteGrid {
  columns: number
  rows: number
}

/**
 * How a source image divides into cells: the cell size plus the two
 * gutters a hand-made or downloaded sheet may carry — `margin` around
 * the whole grid, `spacing` between neighbouring cells. Both default to
 * 0, the tight grid.
 *
 * One parameter object rather than four loose numbers so the slicing
 * rule travels as a unit; the dialog reads all four off its spin rows
 * and hands them straight to both functions below.
 */
export interface SheetSlicing {
  spriteWidth: number
  spriteHeight: number
  spacing?: number
  margin?: number
}

/**
 * Turn a display name into a filesystem- and id-safe slug.
 * (`"Hero Sheet!" → "hero-sheet"`.) Empty input yields a stable
 * fallback so the emitted descriptor always has an id.
 */
export function slugifySpriteSetName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'sprite-set'
}

/** How many whole cells of `tile` px fit along an axis of `length` px. */
function cellsAlong(length: number, tile: number, spacing: number, margin: number): number {
  // The last cell has no gutter after it, so add one back before dividing
  // by the stride. Tiled's own tileset formula, and it is what makes the
  // Kenney roguelike sheet (968 px, 16 px tiles, 1 px spacing) come out
  // as exactly 57 columns rather than 56.
  return Math.max(0, Math.floor((length - 2 * margin + spacing) / (tile + spacing)))
}

/**
 * How many whole sprites of `spriteWidth × spriteHeight` fit into an
 * image, honouring the slicing's `margin` (counted on BOTH sides, as
 * tileset editors do) and inter-cell `spacing`. A partial trailing cell
 * is dropped — the format has no notion of a half sprite. A sprite
 * larger than the image gives a 0-sized grid, which is the dialog's
 * "doesn't fit" state.
 */
export function gridDimensions(imageWidth: number, imageHeight: number, slicing: SheetSlicing): SpriteGrid {
  const { spriteWidth, spriteHeight } = slicing
  const spacing = slicing.spacing ?? 0
  const margin = slicing.margin ?? 0
  // A non-positive sprite size divides to Infinity, which `isUsableGrid`
  // then reports as a perfectly good grid of infinitely many cells.
  // Report the "doesn't fit" state instead.
  if (spriteWidth <= 0 || spriteHeight <= 0) return { columns: 0, rows: 0 }
  return {
    columns: cellsAlong(imageWidth, spriteWidth, spacing, margin),
    rows: cellsAlong(imageHeight, spriteHeight, spacing, margin),
  }
}

/** Whether a grid holds at least one whole sprite. */
export function isUsableGrid(grid: SpriteGrid): boolean {
  return grid.columns >= 1 && grid.rows >= 1
}

/**
 * Top-left corner of cell `index` (row-major) in source-image pixels. The
 * index is clamped to the grid so a stale selection from a bigger sprite
 * size can't read past the last cell.
 */
export function cellOrigin(index: number, grid: SpriteGrid, slicing: SheetSlicing): [number, number] {
  // An empty grid would make the modulo NaN and put NaN coordinates into
  // the preview. Callers guard with `isUsableGrid`, but the origin of a
  // grid with no cells is the origin.
  if (grid.columns <= 0 || grid.rows <= 0) return [0, 0]
  const spacing = slicing.spacing ?? 0
  const margin = slicing.margin ?? 0
  const cell = Math.max(0, Math.min(index, grid.columns * grid.rows - 1))
  return [
    margin + (cell % grid.columns) * (slicing.spriteWidth + spacing),
    margin + Math.floor(cell / grid.columns) * (slicing.spriteHeight + spacing),
  ]
}

/** Spin-row value + upper bound for one collider field, clamped to the cell. */
export function colliderBound(value: number, upper: number): { value: number; upper: number } {
  return { value: Math.max(0, Math.min(value, upper)), upper: Math.max(1, upper) }
}
