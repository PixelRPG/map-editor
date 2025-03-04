import GObject from '@girs/gobject-2.0'

export class Tile extends GObject.Object {

  static {
    GObject.registerClass({
      GTypeName: 'Tile',
    }, this);
  }

  /** Id of the tile */
  id: number

  constructor(tileData: { id: number }) {
    super()
    this.id = tileData.id
  }
}
