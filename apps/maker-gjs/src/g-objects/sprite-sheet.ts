import GObject from '@girs/gobject-2.0'
import { Sprite } from './sprite.ts'
import type { DataSpriteSheet, DataSprite } from '@pixelrpg/common'
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

  rows: DataSpriteSheet['rows'];
  columns: DataSpriteSheet['columns'];

  constructor(spriteSheetData: DataSpriteSheet, imageResources: ImageResource[]) {
    super()
    this.rows = spriteSheetData.rows
    this.columns = spriteSheetData.columns
    this._sprites = this.createSprites(spriteSheetData, imageResources)
  }

  protected createSprites(spriteSheetData: DataSpriteSheet, imageResources: ImageResource[]): InstanceType<typeof Sprite>[] {
    const sprites: InstanceType<typeof Sprite>[] = []
    for (let y = 0; y < spriteSheetData.rows; y++) {
      for (let x = 0; x < spriteSheetData.columns; x++) {
        const index = y * spriteSheetData.columns + x
        const spriteData = spriteSheetData.sprites[index]
        const imageResource = imageResources.find(({ path }) => path === spriteData.image.resourcePath)
        if (!imageResource) {
          console.error('Image resource not found', spriteData.image.resourcePath)
          continue
        }
        // Calculate the sprite slice for each sprite
        const posX = x * spriteData.width
        const posY = y * spriteData.height
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

        const spritePixbuf = imageResource.pixbuf.new_subpixbuf(posX, posY, spriteData.width, spriteData.height)
        const sprite = new Sprite(spriteData, spritePixbuf)

        sprites.push(sprite);
      }
    }

    return sprites
  }
}
