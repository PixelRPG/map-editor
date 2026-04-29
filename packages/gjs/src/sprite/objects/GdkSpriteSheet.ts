import { GdkSprite } from './GdkSprite.ts'
import type { SpriteSetData } from '@pixelrpg/engine'
import { iterateSpriteGrid } from '@pixelrpg/engine'
import type { GdkImageTexture } from '../resource/GdkImageTexture.ts'

/**
 * Grid-organized collection of `GdkSprite`s sliced from a single `Gdk.Texture`.
 *
 * GTK-only — distinct from `ex.SpriteSheet` (which produces canvas/WebGL
 * sprites for the Excalibur game loop). Both pipelines coexist intentionally;
 * see the package README.
 *
 * Uses the shared `iterateSpriteGrid` helper from `@pixelrpg/engine` for
 * consistent grid iteration with the engine-side pipeline.
 */
export class GdkSpriteSheet {
  private _sprites: GdkSprite[]

  rows: number
  columns: number

  constructor(spriteSheetData: SpriteSetData, imageResource: GdkImageTexture) {
    this.rows = spriteSheetData.rows
    this.columns = spriteSheetData.columns
    this._sprites = this.createSprites(spriteSheetData, imageResource)
  }

  /** All sprites in the sprite sheet, in row-major order. */
  get sprites(): GdkSprite[] {
    return this._sprites
  }

  /**
   * Get a sprite by its grid coordinates.
   * @param x Column index (0-based)
   * @param y Row index (0-based)
   */
  getSprite(x: number, y: number): GdkSprite | undefined {
    if (x >= this.columns || x < 0 || y >= this.rows || y < 0) {
      console.warn(
        `Invalid sprite coordinates (${x}, ${y}) for ${this.columns}x${this.rows} sprite sheet`,
      )
      return undefined
    }
    const index = y * this.columns + x
    return this._sprites[index]
  }

  protected createSprites(
    spriteSheetData: SpriteSetData,
    imageResource: GdkImageTexture,
  ): GdkSprite[] {
    if (!imageResource?.texture) {
      throw new Error(
        `Image resource not loaded: ${spriteSheetData.image?.path}`,
      )
    }
    const sprites: GdkSprite[] = []
    for (const cell of iterateSpriteGrid(spriteSheetData)) {
      sprites.push(
        GdkSprite.fromSubTexture(
          imageResource.texture,
          cell.x,
          cell.y,
          cell.width,
          cell.height,
          cell.index,
        ),
      )
    }
    return sprites
  }
}
