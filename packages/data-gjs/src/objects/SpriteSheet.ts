import GObject from '@girs/gobject-2.0'
import { SpriteResource } from '../resource/SpriteResource.ts'
import type { SpriteSetData } from '@pixelrpg/data-core'
import type { ImageResource } from '../resource/ImageResource.ts'

/**
 * Represents a collection of sprites from a source image with some organization in a grid
 *
 * Similar to Excalibur SpriteSheet: `packages/excalibur/src/engine/Graphics/SpriteSheet.ts`
 *
 * @see SpriteSetResource For loading sprite set JSON files and images
 * @see SpriteResource For individual sprite representation
 */
export class SpriteSheet extends GObject.Object {
  // GObject properties
  declare _sprites: SpriteResource[]

  static {
    GObject.registerClass(
      {
        GTypeName: 'SpriteSheet',
        Properties: {
          // TODO: jsobject?
          sprites: GObject.ParamSpec.jsobject<SpriteResource[]>(
            'sprites',
            'Sprites',
            'Sprites of the spriteSheet',
            GObject.ParamFlags.READWRITE,
          ),
        },
      },
      this,
    )
  }

  rows: number
  columns: number

  /**
   * Creates a new SpriteSheet to process sprite set data into individual sprites
   */
  constructor(spriteSheetData: SpriteSetData, imageResource: ImageResource) {
    super()
    this.rows = spriteSheetData.rows
    this.columns = spriteSheetData.columns
    this._sprites = this.createSprites(
      spriteSheetData,
      imageResource,
      spriteSheetData.rows,
      spriteSheetData.columns,
    )
  }

  /**
   * Get all sprites in the sprite sheet (similar to Excalibur SpriteSheet.sprites)
   */
  get sprites(): SpriteResource[] {
    return this._sprites
  }

  /**
   * Get a sprite by its grid coordinates (similar to Excalibur SpriteSheet.getSprite)
   * @param x Column index (0-based)
   * @param y Row index (0-based)
   */
  getSprite(x: number, y: number): SpriteResource | undefined {
    if (x >= this.columns || x < 0 || y >= this.rows || y < 0) {
      console.warn(
        `Invalid sprite coordinates (${x}, ${y}) for ${this.columns}x${this.rows} sprite sheet`,
      )
      return undefined
    }
    const index = y * this.columns + x
    return this._sprites[index]
  }

  /**
   * Creates individual sprite resources from a sprite sheet image
   */
  protected createSprites(
    spriteSheetData: SpriteSetData,
    imageResource: ImageResource,
    rows: number,
    columns: number,
  ): SpriteResource[] {
    const sprites: SpriteResource[] = []

    // Calculate individual sprite dimensions
    const textureWidth = imageResource.width
    const textureHeight = imageResource.height
    const spriteWidth = Math.floor(textureWidth / spriteSheetData.columns)
    const spriteHeight = Math.floor(textureHeight / spriteSheetData.rows)

    for (let y = 0; y < spriteSheetData.rows; y++) {
      for (let x = 0; x < spriteSheetData.columns; x++) {
        const index = y * spriteSheetData.columns + x
        if (!imageResource) {
          console.error('Image resource not found', spriteSheetData.image?.path)
          continue
        }

        // Calculate the correct sprite position in the texture
        // Fixed: posX should be x * spriteWidth, posY should be y * spriteHeight
        const posX = x * spriteWidth
        const posY = y * spriteHeight

        console.log(
          `Creating sprite ${index} at position (${posX}, ${posY}) with size ${spriteWidth}x${spriteHeight}`,
        )

        // Create sprite using sub-texture extraction with SpritePaintable
        const sprite = SpriteResource.fromSubTexture(
          imageResource.texture,
          posX,
          posY,
          spriteWidth,
          spriteHeight,
        )

        sprites.push(sprite)
      }
    }

    return sprites
  }
}
