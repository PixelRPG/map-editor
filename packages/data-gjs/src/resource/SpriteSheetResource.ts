import GObject from '@girs/gobject-2.0'
import { SpriteResource } from './SpriteResource'
import type { SpriteSetData } from '@pixelrpg/data-core'
import type { ImageResource } from './ImageResource'

/**
 * Represents a sprite sheet containing multiple sprites
 * Moved from apps/maker-gjs to enable reuse across packages
 */
export class SpriteSheetResource extends GObject.Object {

  // GObject properties
  declare _sprites: SpriteResource[]

  static {
    GObject.registerClass({
      GTypeName: 'SpriteSheetResource',
      Properties: {
        // TODO: jsobject?
        sprites: GObject.ParamSpec.jsobject<SpriteResource[]>('sprites', 'Sprites', 'Sprites of the spriteSheet', GObject.ParamFlags.READWRITE),
      }
    }, this);
  }

  rows: number
  columns: number

  constructor(spriteSheetData: SpriteSetData, imageResource: ImageResource) {
    super()
    this.rows = spriteSheetData.rows
    this.columns = spriteSheetData.columns
    this._sprites = this.createSprites(spriteSheetData, imageResource, spriteSheetData.rows, spriteSheetData.columns)
  }

  protected createSprites(spriteSheetData: SpriteSetData, imageResource: ImageResource, rows: number, columns: number): SpriteResource[] {
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
        
        console.log(`Creating sprite ${index} at position (${posX}, ${posY}) with size ${spriteWidth}x${spriteHeight}`)

        // Create sprite using sub-texture extraction with SpritePaintable
        const sprite = SpriteResource.fromSubTexture(
          imageResource.texture,
          posX,
          posY,
          spriteWidth,
          spriteHeight
        );

        sprites.push(sprite);
      }
    }

    return sprites
  }
}
