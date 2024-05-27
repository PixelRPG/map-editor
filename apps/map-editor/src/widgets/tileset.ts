import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { DataTileset } from '@pixelrpg/common'
import { Tile } from './tile.ts'

// import Template from './tileset.ui?raw'

export const Tileset = GObject.registerClass(
  {
    GTypeName: 'Tileset',
    // Template,
  },
  class Tileset extends Gtk.FlowBox {
    constructor(data: DataTileset) {

      const model = new Gtk.ListStore(Tile)
      // model.set_column_types([Tile as unknown as GObject.GType]) // TODO missing property __type__

      for (const tile of data.tiles) {
        model.set(model.append(), [0], [new Tile(tile)]);
      }

      super({
        orientation: Gtk.Orientation.HORIZONTAL,
        selectionMode: Gtk.SelectionMode.SINGLE,
      })
    }
  },
)
