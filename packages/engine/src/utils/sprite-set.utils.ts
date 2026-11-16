import type { SpriteSheetSpacingDimensions } from 'excalibur'

import type { SpriteSetData } from '../types'

/** Grid position for a sprite within a sprite sheet. */
export interface SpriteGridPosition {
  col: number
  row: number
  index: number
}

/**
 * Build a lookup from sprite-ID to grid position.
 * Shared between engine SpriteSetResource and GdkSpriteSetResource.
 */
export function buildSpriteIdMap(data: SpriteSetData): Map<number, SpriteGridPosition> {
  const map = new Map<number, SpriteGridPosition>()
  for (const sprite of data.sprites) {
    const index = sprite.row * data.columns + sprite.col
    map.set(sprite.id, { col: sprite.col, row: sprite.row, index })
  }
  return map
}

/** Grid cell yielded by {@link iterateSpriteGrid}. */
export interface SpriteGridCell {
  col: number
  row: number
  index: number
  x: number
  y: number
  width: number
  height: number
}

/**
 * Iterate over all grid cells in a sprite sheet, row-major.
 * Uses `spriteWidth`/`spriteHeight` from the SpriteSetData JSON as the
 * authoritative tile dimensions, offset by the sheet's `margin` (the
 * border around the whole grid) and `spacing` (the gutter between
 * neighbouring cells). Both default to 0, which is the tight grid every
 * sheet the editor used to ship.
 */
export function* iterateSpriteGrid(data: SpriteSetData): Generator<SpriteGridCell> {
  const spriteWidth = data.spriteWidth
  const spriteHeight = data.spriteHeight
  const margin = data.margin ?? 0
  const spacing = data.spacing ?? 0
  for (let row = 0; row < data.rows; row++) {
    for (let col = 0; col < data.columns; col++) {
      yield {
        col,
        row,
        index: row * data.columns + col,
        x: margin + col * (spriteWidth + spacing),
        y: margin + row * (spriteHeight + spacing),
        width: spriteWidth,
        height: spriteHeight,
      }
    }
  }
}

/**
 * Excalibur's spacing descriptor for a sheet, or `undefined` for a tight
 * grid (no border, no gutter) where Excalibur wants the option omitted.
 *
 * The two vocabularies collide on one word: Excalibur's `margin` is the
 * gutter BETWEEN sprites, while `SpriteSetData.margin` is the border
 * AROUND the grid, which Excalibur calls `originOffset`. Mapping our
 * `spacing` onto Excalibur's `margin` and dropping our `margin` on the
 * floor is exactly the bug this helper exists to make impossible to
 * repeat — and being a pure function of the descriptor, it can be
 * asserted without loading an `ImageSource`.
 */
export function spriteSheetSpacingOf(data: SpriteSetData): SpriteSheetSpacingDimensions | undefined {
  const margin = data.margin ?? 0
  const spacing = data.spacing ?? 0
  if (!margin && !spacing) return undefined
  return {
    originOffset: { x: margin, y: margin },
    margin: { x: spacing, y: spacing },
  }
}
