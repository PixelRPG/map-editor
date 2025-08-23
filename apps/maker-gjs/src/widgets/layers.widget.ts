import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { Layer } from '../objects/layer.ts'
import { LayerRowWidget } from './layer-row.widget.ts'

import Template from './layers.widget.blp'

export class LayersWidget extends Adw.Bin {
  // GObject properties
  declare _layers: Layer[]

  // GObject internal children
  declare _listBox: Gtk.ListBox

  // Signal management
  private _signalHandlers: number[] = []

  static {
    GObject.registerClass(
      {
        GTypeName: 'LayersWidget',
        Template,
        InternalChildren: ['listBox'],
        Properties: {
          layers: GObject.ParamSpec.jsobject<Layer[]>(
            'layers',
            'Layers',
            'Layers',
            GObject.ParamFlags.READWRITE,
          ),
        },
      },
      this,
    )
  }

  constructor(layersObject: Layer[]) {
    super({})
    this._layers = layersObject

    for (const layer of this._layers) {
      const actionRow = new LayerRowWidget(layer)
      this._listBox.append(actionRow)
    }
  }

  onRowActivated(box: Gtk.ListBox, row: LayerRowWidget) {
    console.log('[LayersWidget] Activated layer:', row._layer)
  }

  onRowSelected(box: Gtk.ListBox, row: LayerRowWidget) {
    console.log('[LayersWidget] Selected layer:', row._layer)
    row.activate()
  }

  /**
   * Connect signals when widget becomes visible (GTK 4 lifecycle pattern)
   */
  vfunc_map(): void {
    super.vfunc_map()

    if (this._signalHandlers.length === 0) {
      // Connect list box signals
      const rowActivatedId = this._listBox.connect(
        'row-activated',
        this.onRowActivated,
      )
      const rowSelectedId = this._listBox.connect(
        'row-selected',
        this.onRowSelected,
      )
      this._signalHandlers.push(rowActivatedId, rowSelectedId)
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
          this._listBox.disconnect(handlerId)
        }
      }
      this._signalHandlers = []
    }

    super.vfunc_unmap()
  }
}

GObject.type_ensure(LayersWidget.$gtype)
