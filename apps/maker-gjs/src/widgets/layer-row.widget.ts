import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { Layer } from '../objects/layer.ts'
// import { LayerWidget } from './layer.widget.ts'

import Template from './layer-row.widget.blp'

export class LayerRowWidget extends Adw.ActionRow {
  // GObject properties
  declare _layer: Layer | null

  // Signal management
  private _signalHandlers: number[] = []

  static {
    GObject.registerClass(
      {
        GTypeName: 'LayerRowWidget',
        Template,
        Properties: {
          layer: GObject.ParamSpec.object(
            'layer',
            'Layer',
            'Layer for the row',
            GObject.ParamFlags.READWRITE as any,
            Layer,
          ),
        },
      },
      this,
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

  /**
   * Connect signals when widget becomes visible (GTK 4 lifecycle pattern)
   */
  vfunc_map(): void {
    super.vfunc_map()

    if (this._signalHandlers.length === 0) {
      // Connect activated signal
      const activatedId = this.connect('activated', this.onActivated)
      this._signalHandlers.push(activatedId)
    }
  }

  /**
   * Disconnect signals when widget becomes invisible (GC-safe cleanup)
   */
  vfunc_unmap(): void {
    if (this._signalHandlers.length > 0) {
      // Disconnect all signal handlers
      for (const handlerId of this._signalHandlers) {
        if (handlerId > 0) {
          this.disconnect(handlerId)
        }
      }
      this._signalHandlers = []
    }

    super.vfunc_unmap()
  }
}

GObject.type_ensure(LayerRowWidget.$gtype)
