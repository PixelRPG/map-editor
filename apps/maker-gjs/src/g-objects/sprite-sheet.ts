import GObject from '@girs/gobject-2.0'
import { Sprite } from './sprite.ts'
import type { SpriteSetData } from '@pixelrpg/data-core'
import type { ImageResource } from '../types/image-resource.ts'

// import Template from './spriteSheet.ui?raw'

export interface SpriteSheet {
  _sprites: InstanceType<typeof Sprite>[];
}

export class SpriteSheet extends GObject.Object {

  static {
    GObject.registerClass({
      GTypeName: 'SpriteSheet',
      // Template,
      Properties: {
        // TODO: jsobject?
        sprites: GObject.ParamSpec.jsobject<InstanceType<typeof Sprite>[]>('sprites', 'Sprites', 'Sprites of the spriteSheet', GObject.ParamFlags.READWRITE),
      }
    }, this);
  }

  rows: number
  columns: number

  constructor(spriteSheetData: SpriteSetData, imageResources: ImageResource[]) {
    super()
    this.rows = spriteSheetData.rows
    this.columns = spriteSheetData.columns
    this._sprites = this.createSprites(spriteSheetData, imageResources, spriteSheetData.rows, spriteSheetData.columns)
  }

  protected createSprites(spriteSheetData: SpriteSetData, imageResources: ImageResource[], rows: number, columns: number): InstanceType<typeof Sprite>[] {
    const sprites: InstanceType<typeof Sprite>[] = []
    for (let y = 0; y < spriteSheetData.rows; y++) {
      for (let x = 0; x < spriteSheetData.columns; x++) {
        const index = y * spriteSheetData.columns + x
        const spriteData = spriteSheetData.sprites[index]
        const imageResource = imageResources.find(({ path }) => path === spriteSheetData.image?.path)
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
