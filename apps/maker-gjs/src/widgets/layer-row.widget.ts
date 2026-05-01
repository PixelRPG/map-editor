import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import { SignalScope } from '@pixelrpg/gjs'

import { Layer } from '../objects/layer.ts'

import Template from './layer-row.widget.blp'

export class LayerRowWidget extends Adw.ActionRow {
  // GObject properties
  declare _layer: Layer | null

  private signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'LayerRowWidget',
        Template,
        Properties: {
          layer: GObject.ParamSpec.object('layer', 'Layer', 'Layer for the row', GObject.ParamFlags.READWRITE, Layer),
        },
      },
      LayerRowWidget,
    )
  }

  constructor(layerObject: Layer) {
    super({
      title: layerObject.name,
      subtitle: layerObject.type || '',
    })
    this._layer = layerObject
  }

  onActivated(row: this) {
    console.log('[LayerRowWidget] Activated layer:', row._layer)
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this, 'activated', this.onActivated.bind(this))
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(LayerRowWidget.$gtype)
