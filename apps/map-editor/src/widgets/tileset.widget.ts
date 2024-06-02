import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import Gio from '@girs/gio-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { DataTileset, DataResource } from '@pixelrpg/common'
import { Tile } from '../models/tile.ts'
import { Sprite } from '../models/sprite.ts'
import { SpriteSheet } from '../models/sprite-sheet.ts'
import { Tileset } from '../models/tileset.ts'

import type { ImageResource } from '../types/image-resource.ts'

import Template from './tileset.widget.ui?raw'

interface _TilesetWidget {
  _tileset: InstanceType<typeof Tileset>
}

class _TilesetWidget extends Gtk.FlowBox {
  constructor(tilesetObject: InstanceType<typeof Tileset>) {

    // const spriteModel = new Gio.ListStore({
    //   itemType: Adw.Bin as unknown as GObject.GType // TODO(ts-for-gir): Fix this in ts-for-gir
    // })



    // const selectableSpriteModel = new Gtk.SingleSelection<typeof spriteModel>({ model: spriteModel });

    super({
      orientation: Gtk.Orientation.HORIZONTAL,
      selectionMode: Gtk.SelectionMode.SINGLE,
    })

    for (const sprite of tilesetObject._spriteSheet._sprites) {

      const item = new Adw.Bin({
        child: new Gtk.Label({
          vexpand: true,
          hexpand: true,
          label: 'A',
          css_classes: ["emoji"],
        }),
        width_request: 16,
        height_request: 16,
        css_classes: ["card"],
      });
      this.append(item);
    }
  }
}

export const TilesetWidget = GObject.registerClass(
  {
    GTypeName: 'TilesetWidget',
    Template,
  },
  _TilesetWidget
)
