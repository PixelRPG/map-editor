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

/**
 * How many whole sprites of `spriteWidth × spriteHeight` fit into an
 * image. A partial trailing cell is dropped — the format has no notion of
 * a half sprite. A sprite larger than the image gives a 0-sized grid,
 * which is the dialog's "doesn't fit" state.
 */
export function gridDimensions(
  imageWidth: number,
  imageHeight: number,
  spriteWidth: number,
  spriteHeight: number,
): SpriteGrid {
  return {
    columns: Math.floor(imageWidth / spriteWidth),
    rows: Math.floor(imageHeight / spriteHeight),
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
export function cellOrigin(
  index: number,
  grid: SpriteGrid,
  spriteWidth: number,
  spriteHeight: number,
): [number, number] {
  const cell = Math.max(0, Math.min(index, grid.columns * grid.rows - 1))
  return [(cell % grid.columns) * spriteWidth, Math.floor(cell / grid.columns) * spriteHeight]
}

/** Spin-row value + upper bound for one collider field, clamped to the cell. */
export function colliderBound(value: number, upper: number): { value: number; upper: number } {
  return { value: Math.max(0, Math.min(value, upper)), upper: Math.max(1, upper) }
}
