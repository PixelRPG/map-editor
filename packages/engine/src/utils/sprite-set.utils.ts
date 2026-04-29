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
export function buildSpriteIdMap(
  data: SpriteSetData,
): Map<number, SpriteGridPosition> {
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
 * authoritative tile dimensions.
 */
export function* iterateSpriteGrid(
  data: SpriteSetData,
): Generator<SpriteGridCell> {
  const spriteWidth = data.spriteWidth
  const spriteHeight = data.spriteHeight
  for (let row = 0; row < data.rows; row++) {
    for (let col = 0; col < data.columns; col++) {
      yield {
        col,
        row,
        index: row * data.columns + col,
        x: col * spriteWidth,
        y: row * spriteHeight,
        width: spriteWidth,
        height: spriteHeight,
      }
    }
  }
}
