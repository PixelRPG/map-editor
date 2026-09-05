import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'
import { isLayerDataVisible, type LayerPlane } from '@pixelrpg/engine'
import { LayerRow } from './layer-row'
import { LayerSection } from './layer-section'
import { type DropAnchor, layersInSection, resolveLayerDrop, SECTION_PLANES } from './layer-sections.ts'
import { SignalScope } from '../../utils/signal-scope.ts'

import Template from './layers-tab.blp'

GObject.type_ensure(LayerRow.$gtype)
GObject.type_ensure(LayerSection.$gtype)

/**
 * Shape consumed by {@link LayersTab.setLayers}. The list order is the
 * map's array order — the tab derives the section rows from it and
 * translates drops back into array positions.
 */
export interface LayerDescriptor {
  id: string
  name: string
  tileCount: number
  /** Absent counts as VISIBLE — the engine's `isLayerDataVisible` rule. */
  visible?: boolean
  locked?: boolean
  /** Absent counts as `ground` — the engine's `DEFAULT_LAYER_PLANE` rule. */
  plane?: LayerPlane
}

/** A `Gtk.ListBoxRow` that remembers which layer it stands for. */
type LayerBoxRow = Gtk.ListBoxRow & { layerId?: string }

/**
 * Inspector's "Layers" tab: three fixed {@link LayerSection}s — Above
 * the hero / At hero height / Below the hero — each a `boxed-list` of
 * {@link LayerRow}s in draw order (top row draws on top), a footer "New
 * layer" button, plus a pinned **Objects** row under the planes: a
 * layer-like global toggle for object placements (eye only, no lock,
 * not selectable as the active layer). Emits:
 * - `layer-selected::<id>` when a row is activated.
 * - `layer-visibility-toggled::<id, visible>` when a row's eye toggle flips.
 * - `layer-lock-toggled::<id, locked>` for the lock toggle.
 * - `layer-move-requested::<id, plane, index>` when a row is dropped —
 *   `plane` is the section it landed in, `index` the array position
 *   (`layer-sections.ts`); the host turns that into a reorder or a
 *   change-of-plane command.
 * - `objects-visibility-toggled::<visible>` for the Objects row's eye.
 */
// Two different `visible` live in this file. `LayerDescriptor.visible` is
// LAYER DATA and is decided ONLY by the engine's `isLayerDataVisible`
// (absent = visible). Every other `.visible` below is the `LayerRow`
// GObject property — the eye toggle's UI state, whose absent-means-hidden
// GTK default is correct and unrelated. Each of those carries a
// `layer-visibility-ok:` marker so the repo guard can tell them apart.
export class LayersTab extends Adw.Bin {
  declare _section_overlay: LayerSection
  declare _section_hero: LayerSection
  declare _section_ground: LayerSection
  declare _objects_list: Gtk.ListBox

  private _layers: Map<string, { row: LayerBoxRow; widget: LayerRow; plane: LayerPlane }> = new Map()
  private _descriptors: LayerDescriptor[] = []
  private _activeId: string | null = null
  private _heroPaintable: Gdk.Paintable | null = null
  private _objectsRow: { row: Gtk.ListBoxRow; widget: LayerRow } | null = null
  private _objectsVisible = true
  /** The layer id a drag carries, so a drop can name it without decoding the content provider. */
  private _draggedId: string | null = null
  /** True while {@link setLayerState} writes — suppresses the toggle re-emit. */
  private _suppressToggleEmit = false
  /** True while one section's selection is mirrored to the others — suppresses the echo. */
  private _syncingSelection = false
  private _signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgLayersTab',
        Template,
        InternalChildren: ['section_overlay', 'section_hero', 'section_ground', 'objects_list'],
        Signals: {
          'layer-selected': { param_types: [GObject.TYPE_STRING] },
          'layer-visibility-toggled': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN],
          },
          'layer-lock-toggled': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN],
          },
          'layer-move-requested': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING, GObject.TYPE_INT],
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
    // Drop targets are controllers: install once per section, for the
    // widget's lifetime (rows are rebuilt on every `setLayers`, the
    // sections are not).
    for (const [section, plane] of this._sections()) this._installDropTarget(section, plane)
  }

  vfunc_map(): void {
    super.vfunc_map()
    for (const [section] of this._sections()) {
      this._signals.connect(section.list, 'row-selected', (_list: Gtk.ListBox, row: Gtk.ListBoxRow | null) => {
        if (!row || this._syncingSelection) return
        const id = (row as LayerBoxRow).layerId
        if (!id) return
        this._activeId = id
        this._syncingSelection = true
        try {
          for (const [other] of this._sections()) {
            if (other.list !== _list) other.list.unselect_all()
          }
        } finally {
          this._syncingSelection = false
        }
        for (const [layerId, entry] of this._layers) {
          entry.widget.active = layerId === id
        }
        this.emit('layer-selected', id)
      })
    }
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    super.vfunc_unmap()
  }

  get activeId(): string | null {
    return this._activeId
  }

  /**
   * The project's player sprite, drawn in every depth glyph on this tab
   * (`null` = silhouette). Applied to the section headers and every row.
   */
  get heroPaintable(): Gdk.Paintable | null {
    return this._heroPaintable
  }

  set heroPaintable(value: Gdk.Paintable | null) {
    this._heroPaintable = value
    for (const [section] of this._sections()) section.heroPaintable = value
    for (const entry of this._layers.values()) entry.widget.heroPaintable = value
  }

  setLayers(layers: LayerDescriptor[]): void {
    this._descriptors = [...layers]
    this._layers.clear()
    for (const [section, plane] of this._sections()) {
      clearListBox(section.list)
      const rows = layersInSection(layers, plane)
      for (const layer of rows) this._appendRow(section.list, layer, plane)
      section.setEmpty(rows.length === 0)
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
      // layer-visibility-ok: writing the row widget's eye state to mirror
      // an engine-side change that already went through the command path.
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
    // layer-visibility-ok: the Objects pseudo-row is not a map layer; this
    // is its own widget eye state.
    if (this._objectsRow.widget.visible !== visible) this._objectsRow.widget.visible = visible
  }

  selectLayer(id: string): void {
    const entry = this._layers.get(id)
    if (!entry) return
    const section = this._sectionFor(entry.plane)
    section.list.select_row(entry.row)
  }

  private _sections(): Array<[LayerSection, LayerPlane]> {
    return SECTION_PLANES.map((plane) => [this._sectionFor(plane), plane])
  }

  private _sectionFor(plane: LayerPlane): LayerSection {
    if (plane === 'overlay') return this._section_overlay
    if (plane === 'hero') return this._section_hero
    return this._section_ground
  }

  private _appendRow(list: Gtk.ListBox, layer: LayerDescriptor, plane: LayerPlane): void {
    const row = new LayerRow({
      layerName: layer.name,
      tileCount: layer.tileCount,
      visible: isLayerDataVisible(layer),
      locked: layer.locked ?? false,
      active: layer.id === this._activeId,
      plane,
    })
    row.heroPaintable = this._heroPaintable
    row.connect('notify::visible', () => {
      if (this._suppressToggleEmit) return
      // layer-visibility-ok: `row.visible` is the LayerRow eye toggle's
      // GObject property, not the layer descriptor's flag.
      this.emit('layer-visibility-toggled', layer.id, row.visible)
    })
    row.connect('notify::locked', () => {
      if (this._suppressToggleEmit) return
      this.emit('layer-lock-toggled', layer.id, row.locked)
    })
    this._installDragSource(row, layer.id)

    const boxRow = new Gtk.ListBoxRow() as LayerBoxRow
    boxRow.layerId = layer.id
    boxRow.set_child(row)
    list.append(boxRow)
    this._layers.set(layer.id, { row: boxRow, widget: row, plane })
  }

  /**
   * A row is a `Gtk.DragSource` carrying its layer id as a string —
   * the same shape `GalleryCard` and the animation editor's chips use.
   * GTK's own drag threshold keeps single-click select working.
   */
  private _installDragSource(row: LayerRow, layerId: string): void {
    const source = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE })
    source.connect('prepare', () => {
      this._draggedId = layerId
      const value = new GObject.Value()
      value.init(GObject.TYPE_STRING)
      value.set_string(layerId)
      return Gdk.ContentProvider.new_for_value(value)
    })
    source.connect('drag-begin', () => source.set_icon(Gtk.WidgetPaintable.new(row), 0, 0))
    source.connect('drag-end', () => {
      this._draggedId = null
    })
    row.add_controller(source)
  }

  /**
   * The whole section is the drop target — header, rows and the empty
   * space under them — so a drag can land in an empty section. The
   * release point picks the anchor row (above / below its midline) or
   * none, and `resolveLayerDrop` turns that into the array position the
   * host dispatches.
   */
  private _installDropTarget(section: LayerSection, plane: LayerPlane): void {
    const target = Gtk.DropTarget.new(GObject.TYPE_STRING, Gdk.DragAction.MOVE)
    target.connect('drop', (_target: Gtk.DropTarget, _value: unknown, x: number, y: number) => {
      const draggedId = this._draggedId
      if (!draggedId) return false
      const drop = resolveLayerDrop(this._descriptors, draggedId, plane, this._anchorAt(section, x, y))
      if (!drop) return false
      this.emit('layer-move-requested', draggedId, drop.plane, drop.index)
      return true
    })
    section.add_controller(target)
  }

  /** The row under a point in the section (in section coordinates), and which half of it. */
  private _anchorAt(section: LayerSection, x: number, y: number): DropAnchor | null {
    const list = section.list
    if (!list.get_visible()) return null
    const [ok, inList] = section.compute_point(list, new Graphene.Point({ x, y }))
    if (!ok) return null
    const row = list.get_row_at_y(inList.y) as LayerBoxRow | null
    if (!row?.layerId) return null
    const [okRow, inRow] = list.compute_point(row, new Graphene.Point({ x: inList.x, y: inList.y }))
    const position = okRow && inRow.y >= row.get_height() / 2 ? 'below' : 'above'
    return { layerId: row.layerId, position }
  }

  /**
   * Pinned "Objects" row under the three planes: a layer-LIKE global
   * toggle for object placements. Eye only (placements lock via their
   * layer), no plane glyph (placements sit at their layer's plane), and
   * not selectable as the active layer. Rebuilt by every `setLayers`.
   */
  private _appendObjectsRow(): void {
    clearListBox(this._objects_list)
    const widget = new LayerRow({
      layerName: 'Objects',
      tileCount: 0,
      visible: this._objectsVisible,
      locked: false,
      active: false,
    })
    widget._lock_button.set_visible(false)
    widget._glyph.set_visible(false)
    widget.connect('notify::visible', () => {
      // layer-visibility-ok: the Objects pseudo-row has no LayerData at
      // all — it toggles object placements globally.
      if (this._objectsVisible === widget.visible) return
      this._objectsVisible = widget.visible
      this.emit('objects-visibility-toggled', widget.visible)
    })
    const boxRow = new Gtk.ListBoxRow({ selectable: false })
    boxRow.set_child(widget)
    this._objects_list.append(boxRow)
    this._objectsRow = { row: boxRow, widget }
  }
}

/** Remove every row of a `Gtk.ListBox`. */
function clearListBox(list: Gtk.ListBox): void {
  let child = list.get_first_child()
  while (child) {
    const next = child.get_next_sibling()
    list.remove(child)
    child = next
  }
}

GObject.type_ensure(LayersTab.$gtype)
