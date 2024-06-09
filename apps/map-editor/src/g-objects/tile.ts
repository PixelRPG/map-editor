import GObject from '@girs/gobject-2.0'
import { Graphic } from './graphic.ts'
import type { DataTile } from '@pixelrpg/common'

interface _Tile {
  /** Graphic for the tile, in Excalibur this is mostly undefined. Instead the image is associated with the `id` of the tile. */
  _graphic: InstanceType<typeof Graphic> | null
}

class _Tile extends GObject.Object {

  /** Id of the tile */
  id: DataTile['id']
  /** Class of the tile */
  class: DataTile['class']

  constructor(tileData: DataTile, graphic: InstanceType<typeof Graphic> | null) {
    super()
    this.id = tileData.id
    this.class = tileData.class
    this._graphic = graphic || null
  }
}

export const Tile = GObject.registerClass(
  {
    GTypeName: 'Tile',
    // Template,
    Properties: {
      // TODO(ts-for-gir): fix type of flags parameter
      graphic: GObject.ParamSpec.object('graphic', 'Graphic', 'Graphic for the tile', GObject.ParamFlags.READWRITE as any, Graphic),
    }
  },
  _Tile
)
