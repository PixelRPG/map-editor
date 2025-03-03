import GObject from '@girs/gobject-2.0'
import type { DataLayer } from '@pixelrpg/common'

interface _Layer {

}

class _Layer extends GObject.Object {

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

export const Layer = GObject.registerClass(
  {
    GTypeName: 'Layer',
    Properties: {}
  },
  _Layer
)
