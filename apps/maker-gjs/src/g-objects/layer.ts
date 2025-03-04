import GObject from '@girs/gobject-2.0'
import type { DataLayer } from '@pixelrpg/common'

export interface Layer {

}

export class Layer extends GObject.Object {

  static {
    GObject.registerClass({
      GTypeName: 'Layer',
      Properties: {}
    }, this);
  }

  type: DataLayer['type']
  class: DataLayer['class']
  name: DataLayer['name']
  order: DataLayer['order']
  properties: DataLayer['properties']

  constructor(tileData: DataLayer) {
    super()
    this.type = tileData.type
    this.class = tileData.class
    this.name = tileData.name
    this.order = tileData.order
    this.properties = tileData.properties
  }
}
