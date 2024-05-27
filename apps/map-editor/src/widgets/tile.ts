import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { DataTile } from '@pixelrpg/common'

// import Template from './tile.ui?raw'

export const Tile = GObject.registerClass(
  {
    GTypeName: 'Tile',
    // Template,
    Properties: {
      // TODO: Some parameters should be optional
      id: GObject.ParamSpec.int64('id', 'Id', 'Id of the tile', GObject.ParamFlags.READWRITE, 0, Number.MAX_SAFE_INTEGER, 0),
      // class: GObject.ParamSpec.string('class', 'Class', 'Class of the tile', GObject.ParamFlags.READWRITE, ''),
      // TODO fix type of flags parameter in ts-for-gir
      // graphic: GObject.ParamSpec.object('graphic', 'Graphic', 'Graphic for the tile', GObject.ParamFlags.READWRITE as any, GdkPixbuf.Pixbuf),
    }
  },
  class Tile extends GObject.Object {

    // class: string
    // graphic: GdkPixbuf.Pixbuf
    get id() {
      return this.get_property('id')
    }

    set id(value: number) {
      this.set_property('id', value)
    }

    constructor(data: DataTile) {
      super()
      this.id = data.id
    }
  },
)
