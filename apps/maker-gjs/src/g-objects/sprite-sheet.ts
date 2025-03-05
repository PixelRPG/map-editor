import GObject from '@girs/gobject-2.0'
import { Sprite } from './sprite.ts'
import type { ImageReference, SpriteSetData } from '@pixelrpg/data-core'
import type { ImageResource } from '@pixelrpg/data-gjs'

// import Template from './spriteSheet.ui?raw'

export interface SpriteSheet {
  _sprites: Sprite[];
}

export class SpriteSheet extends GObject.Object {

  static {
    GObject.registerClass({
      GTypeName: 'SpriteSheet',
      // Template,
      Properties: {
        // TODO: jsobject?
        sprites: GObject.ParamSpec.jsobject<Sprite[]>('sprites', 'Sprites', 'Sprites of the spriteSheet', GObject.ParamFlags.READWRITE),
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

  protected createSprites(spriteSheetData: SpriteSetData, imageResource: ImageResource, rows: number, columns: number): Sprite[] {
    const sprites: Sprite[] = []
    for (let y = 0; y < spriteSheetData.rows; y++) {
      for (let x = 0; x < spriteSheetData.columns; x++) {
        const index = y * spriteSheetData.columns + x
        const spriteData = spriteSheetData.sprites[index]
        if (!imageResource) {
          console.error('Image resource not found', spriteSheetData.image?.path)
          continue
        }
        // Calculate the sprite slice for each sprite
        const posX = x * rows
        const posY = y * columns
        // console.log({
        //   posX,
        //   posY,
        //   width: spriteData.width,
        //   height: spriteData.height,
        //   imageWidth: spriteData.image.width,
        //   imageHeight: spriteData.image.height,
        //   pixbufWidth: imageResource.pixbuf.width,
        //   pixbufHeight: imageResource.pixbuf.height,
        // })

        const spritePixbuf = imageResource.pixbuf.new_subpixbuf(posX, posY, rows, columns)
        const sprite = new Sprite(spritePixbuf)

        sprites.push(sprite);
      }
    }

    return sprites
  }
}
