import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import Gio from '@girs/gio-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { DataTileset, DataResource } from '@pixelrpg/common'
import { Tile } from '../objects/tile.ts'
import { Sprite } from '../objects/sprite.ts'
import { SpriteSheet } from '../objects/sprite-sheet.ts'
import { Tileset } from '../objects/tileset.ts'

import type { ImageResource } from '../types/image-resource.ts'

// import Template from './tileset.ui?raw'

interface _TilesetWidget {
  _tileset: InstanceType<typeof Tileset>
}

class _TilesetWidget extends Gtk.FlowBox {
  constructor(tilesetObject: InstanceType<typeof Tileset>) {

    const model = new Gio.ListStore({
      itemType: Tile as unknown as GObject.GType // TODO(ts-for-gir): Fix this in ts-for-gir
    })

    for (const tile of tilesetObject._tiles) {
      model.append(tile)
    }

    super({
      orientation: Gtk.Orientation.HORIZONTAL,
      selectionMode: Gtk.SelectionMode.SINGLE,
    })
  }
}

export const TilesetWidget = GObject.registerClass(
  {
    GTypeName: 'TilesetWidget',
    // Template,
  },
  _TilesetWidget
)
