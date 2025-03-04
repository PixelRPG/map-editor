import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { Layer } from '../g-objects/layer.ts'
// import { LayerWidget } from './layer.widget.ts'

import Template from './layer-row.widget.ui?raw'

export interface LayerRowWidget {
  // Properties
  _layer: Layer
}

export class LayerRowWidget extends Adw.ActionRow {

  static {
    GObject.registerClass(
      {
        GTypeName: 'LayerRowWidget',
        Template,
        Properties: {
          layer: GObject.ParamSpec.object('layer', 'Layer', 'Layer for the row', GObject.ParamFlags.READWRITE as any, Layer),
        },
      },
      this
    )
  }

  constructor(layerObject: Layer) {

    super({
      title: layerObject.name,
      subtitle: layerObject.type || '',
    })
    this._layer = layerObject

    // TODO(ts-for-gir): Add / fix signal types
    this.connect("activated", this.onActivated);
  }

  onActivated(row: this) {
    console.log("[LayerRowWidget] Activated layer:", row._layer);
  }
}

