import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import Gio from '@girs/gio-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { DataTileset, DataResource } from '@pixelrpg/common'
import { Tile } from './tile.ts'

import type { ImageResource } from '../types/image-resource.ts'

// import Template from './tileset.ui?raw'

export const Tileset = GObject.registerClass(
  {
    GTypeName: 'Tileset',
    // Template,
  },
  class Tileset extends Gtk.FlowBox {
    constructor(data: DataTileset, imageResources: ImageResource[]) {

      const model = new Gio.ListStore({
        itemType: Tile as unknown as GObject.GType // TODO(ts-for-gir): Fix this in ts-for-gir
      })

      for (let y = 0; y < data.spritesheet.rows; y++) {
        for (let x = 0; x < data.spritesheet.columns; x++) {
          const index = y * data.spritesheet.columns + x
          const sprite = data.spritesheet.sprites[index]
          const imageResource = imageResources.find(({ path }) => path === sprite.image.resourcePath)
          if (!imageResource) {
            console.error('Image resource not found', sprite.image.resourcePath)
            continue
          }
          // Calculate the sprite slice for each sprite
          const posX = x * sprite.width
          const posY = y * sprite.height
          console.log({
            posX,
            posY,
            width: sprite.width,
            height: sprite.height,
            imageWidth: sprite.image.width,
            imageHeight: sprite.image.height,
            pixbufWidth: imageResource.pixbuf.width,
            pixbufHeight: imageResource.pixbuf.height,
          })
          const spriteImage = imageResource.pixbuf.new_subpixbuf(posX, posY, sprite.width, sprite.height)
          // res.push({
          //   ...sprite,
          //   image: spriteImage
          // });
        }
      }

      for (const tile of data.tiles) {
        model.append(new Tile(tile))
      }

      super({
        orientation: Gtk.Orientation.HORIZONTAL,
        selectionMode: Gtk.SelectionMode.SINGLE,
      })
    }
  },
)
