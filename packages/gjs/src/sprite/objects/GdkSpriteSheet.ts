import { GdkSprite } from './GdkSprite.ts'
import type { SpriteSetData } from '@pixelrpg/engine'
import type { GdkImageTexture } from '../resource/GdkImageTexture.ts'

/**
 * Grid-organized collection of `GdkSprite`s sliced from a single `Gdk.Texture`.
 *
 * GTK-only — distinct from `ex.SpriteSheet` (which produces canvas/WebGL
 * sprites for the Excalibur game loop). Both pipelines coexist intentionally;
 * see the package README.
 */
export class GdkSpriteSheet {
  private _sprites: GdkSprite[]

  rows: number
  columns: number

  constructor(spriteSheetData: SpriteSetData, imageResource: GdkImageTexture) {
    this.rows = spriteSheetData.rows
    this.columns = spriteSheetData.columns
    this._sprites = this.createSprites(
      spriteSheetData,
      imageResource,
      spriteSheetData.rows,
      spriteSheetData.columns,
    )
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
    _rows: number,
    _columns: number,
  ): GdkSprite[] {
    if (!imageResource) {
      throw new Error(
        `Image resource not found: ${spriteSheetData.image?.path}`,
      )
    }
    if (!imageResource.texture) {
      throw new Error(
        `Image resource not loaded: ${spriteSheetData.image?.path}`,
      )
    }
    const sprites: GdkSprite[] = []

    const textureWidth = imageResource.width
    const textureHeight = imageResource.height
    const spriteWidth = Math.floor(textureWidth / spriteSheetData.columns)
    const spriteHeight = Math.floor(textureHeight / spriteSheetData.rows)

    for (let y = 0; y < spriteSheetData.rows; y++) {
      for (let x = 0; x < spriteSheetData.columns; x++) {
        const index = y * spriteSheetData.columns + x
        const posX = x * spriteWidth
        const posY = y * spriteHeight

        const sprite = GdkSprite.fromSubTexture(
          imageResource.texture,
          posX,
          posY,
          spriteWidth,
          spriteHeight,
          index,
        )

        sprites.push(sprite)
      }
    }

    return sprites
  }
}
