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
 * button, plus a pinned **Objects** row — a layer-like global toggle for
 * object placements on the map (eye only, no lock, not selectable as
 * the active layer). Emits:
 * - `layer-selected::<id>` when a row is activated.
 * - `layer-visibility-toggled::<id, visible>` when a row's eye toggle flips.
 * - `layer-lock-toggled::<id, locked>` for the lock toggle.
 * - `objects-visibility-toggled::<visible>` for the Objects row's eye.
 */
export class LayersTab extends Adw.Bin {
  declare _list: Gtk.ListBox

  private _layers: Map<string, { row: Gtk.ListBoxRow; widget: LayerRow }> = new Map()
  private _activeId: string | null = null
  private _objectsRow: { row: Gtk.ListBoxRow; widget: LayerRow } | null = null
  private _objectsVisible = true
  /** True while {@link setLayerState} writes — suppresses the toggle re-emit. */
  private _suppressToggleEmit = false

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
          // The Objects pseudo-row's eye flipped (global placement visibility).
          'objects-visibility-toggled': { param_types: [GObject.TYPE_BOOLEAN] },
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
        if (this._suppressToggleEmit) return
        this.emit('layer-visibility-toggled', layer.id, row.visible)
      })
      row.connect('notify::locked', () => {
        if (this._suppressToggleEmit) return
        this.emit('layer-lock-toggled', layer.id, row.locked)
      })

      const boxRow = new Gtk.ListBoxRow() as Gtk.ListBoxRow & { layerId?: string }
      boxRow.layerId = layer.id
      boxRow.set_child(row)
      this._list.append(boxRow)
      this._layers.set(layer.id, { row: boxRow, widget: row })
    }
    this._appendObjectsRow()
  }

  /**
   * Reflect an engine-side layer-flag change (remote peer op, undo,
   * redo) on the matching row's eye / padlock toggle WITHOUT
   * re-emitting `layer-visibility-toggled` / `layer-lock-toggled` —
   * the change already rode a command, re-emitting would dispatch a
   * redundant no-op toggle. Unknown ids are ignored (a peer can
   * toggle a layer this map no longer lists).
   */
  setLayerState(id: string, flag: 'visible' | 'locked', value: boolean): void {
    const entry = this._layers.get(id)
    if (!entry) return
    this._suppressToggleEmit = true
    try {
      if (flag === 'visible') entry.widget.visible = value
      else entry.widget.locked = value
    } finally {
      this._suppressToggleEmit = false
    }
  }

  /**
   * Update the Objects pseudo-row's placement count + eye state without
   * re-emitting `objects-visibility-toggled`.
   */
  setObjectsState(count: number, visible: boolean): void {
    this._objectsVisible = visible
    if (!this._objectsRow) return
    this._objectsRow.widget.tileCount = count
    if (this._objectsRow.widget.visible !== visible) this._objectsRow.widget.visible = visible
  }

  /**
   * Pinned "Objects" row at the end of the layer list: a layer-LIKE
   * global toggle for object placements. Eye only (placements lock via
   * their layer), and not selectable as the active layer. Rebuilt by
   * every `setLayers` so it always sits below the real layers.
   */
  private _appendObjectsRow(): void {
    const widget = new LayerRow({
      layerName: 'Objects',
      tileCount: 0,
      visible: this._objectsVisible,
      locked: false,
      active: false,
    })
    widget._lock_button.set_visible(false)
    widget.connect('notify::visible', () => {
      if (this._objectsVisible === widget.visible) return
      this._objectsVisible = widget.visible
      this.emit('objects-visibility-toggled', widget.visible)
    })
    const boxRow = new Gtk.ListBoxRow({ selectable: false })
    boxRow.set_child(widget)
    this._list.append(boxRow)
    this._objectsRow = { row: boxRow, widget }
  }

  selectLayer(id: string): void {
    const entry = this._layers.get(id)
    if (!entry) return
    this._list.select_row(entry.row)
  }
}

GObject.type_ensure(LayersTab.$gtype)
