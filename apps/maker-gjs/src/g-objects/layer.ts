import GObject from '@girs/gobject-2.0'

export class Layer extends GObject.Object {

  static {
    GObject.registerClass({
      GTypeName: 'Layer',
      Properties: {}
    }, this);
  }

  name: string

  constructor(layerData: { name: string }) {
    super()
    this.name = layerData.name
  }
}
