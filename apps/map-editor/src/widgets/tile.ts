import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { DataTile } from '@pixelrpg/common'

// import Template from './tile.ui?raw'

interface _Tile {
  /** Id of the tile */
  _id: DataTile['id']
  /** Class of the tile */
  _class: DataTile['class']
  /** Graphic for the tile */
  _graphic: GdkPixbuf.Pixbuf
}

class _Tile extends GObject.Object {

  constructor(data: DataTile) {
    super()
    this._id = data.id
    this._class = data.class
    // this._graphic = data.graphic
  }
}

export const Tile = GObject.registerClass(
  {
    GTypeName: 'Tile',
    // Template,
    Properties: {
      id: GObject.ParamSpec.int64('id', 'Id', 'Id of the tile', GObject.ParamFlags.READWRITE, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0),
      class: GObject.ParamSpec.string('class', 'Class', 'Class of the tile', GObject.ParamFlags.READWRITE, ''),
      // TODO(ts-for-gir): fix type of flags parameter
      graphic: GObject.ParamSpec.object('graphic', 'Graphic', 'Graphic for the tile', GObject.ParamFlags.READWRITE as any, GdkPixbuf.Pixbuf),
    }
  },
  _Tile
)
