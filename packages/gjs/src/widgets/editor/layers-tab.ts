import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { LayerRow } from './layer-row'

import Template from './layers-tab.blp'

GObject.type_ensure(LayerRow.$gtype)

/**
 * Shape consumed by {@link LayersTab.setLayers}.
 */
export interface LayerDescriptor {
  id: string
  name: string
  tileCount: number
  visible?: boolean
  locked?: boolean
}

/**
 * Inspector's "Layers" tab.
 *
 * Renders a `boxed-list` of {@link LayerRow} widgets, footer "New layer"
 * button. Emits:
 * - `layer-selected::<id>` when a row is activated.
 * - `layer-visibility-toggled::<id, visible>` when a row's eye toggle flips.
 * - `layer-lock-toggled::<id, locked>` for the lock toggle.
 */
export class LayersTab extends Adw.Bin {
  declare _list: Gtk.ListBox

  private _layers: Map<string, { row: Gtk.ListBoxRow; widget: LayerRow }> = new Map()
  private _activeId: string | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgLayersTab',
        Template,
        InternalChildren: ['list'],
        Signals: {
          'layer-selected': { param_types: [GObject.TYPE_STRING] },
          'layer-visibility-toggled': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN],
          },
          'layer-lock-toggled': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN],
          },
        },
      },
      LayersTab,
    )
  }

  constructor() {
    super()
    this._list.connect('row-selected', (_list, row) => {
      if (!row) return
      const id = (row as Gtk.ListBoxRow & { layerId?: string }).layerId
      if (!id) return
      this._activeId = id
      for (const [layerId, entry] of this._layers) {
        entry.widget.active = layerId === id
      }
      this.emit('layer-selected', id)
    })
  }

  get activeId(): string | null {
    return this._activeId
  }

  setLayers(layers: LayerDescriptor[]): void {
    let child = this._list.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._list.remove(child)
      child = next
    }
    this._layers.clear()

    for (const layer of layers) {
      const row = new LayerRow({
        layerName: layer.name,
        tileCount: layer.tileCount,
        visible: layer.visible ?? true,
        locked: layer.locked ?? false,
        active: layer.id === this._activeId,
      })
      row.connect('notify::visible', () => {
        this.emit('layer-visibility-toggled', layer.id, row.visible)
      })
      row.connect('notify::locked', () => {
        this.emit('layer-lock-toggled', layer.id, row.locked)
      })

      const boxRow = new Gtk.ListBoxRow() as Gtk.ListBoxRow & { layerId?: string }
      boxRow.layerId = layer.id
      boxRow.set_child(row)
      this._list.append(boxRow)
      this._layers.set(layer.id, { row: boxRow, widget: row })
    }
  }

  selectLayer(id: string): void {
    const entry = this._layers.get(id)
    if (!entry) return
    this._list.select_row(entry.row)
  }
}

GObject.type_ensure(LayersTab.$gtype)
