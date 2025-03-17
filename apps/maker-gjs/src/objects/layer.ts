import GObject from '@girs/gobject-2.0'

// TODO: Move to packages/data-gjs
export class Layer extends GObject.Object {

  static {
    GObject.registerClass({
      GTypeName: 'Layer',
      Properties: {}
    }, this);
  }

  name: string
  type: string

  constructor(layerData: { name: string, type: string }) {
    super()
    this.name = layerData.name
    this.type = layerData.type
  }
}
