import GObject from '@girs/gobject-2.0'

export class Layer extends GObject.Object {
  // Private fields for GObject properties
  private _name: string = ''
  private _type: string = ''

  static {
    GObject.registerClass(
      {
        GTypeName: 'Layer',
        Properties: {
          name: GObject.ParamSpec.string(
            'name',
            'Name',
            'Layer name',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          type: GObject.ParamSpec.string(
            'type',
            'Type',
            'Layer type',
            GObject.ParamFlags.READWRITE,
            '',
          ),
        },
      },
      this,
    )
  }

  constructor(layerData: { name: string; type: string }) {
    super()
    this.name = layerData.name
    this.type = layerData.type
  }

  // GObject property getters and setters
  get name(): string {
    return this._name
  }

  set name(value: string) {
    if (this._name === value) return

    this._name = value
    this.notify('name')
  }

  get type(): string {
    return this._type
  }

  set type(value: string) {
    if (this._type === value) return

    this._type = value
    this.notify('type')
  }
}
