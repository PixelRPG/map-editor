import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'
import { isLayerDataVisible, type LayerPlane } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import { LayerRow } from './layer-row'
import { LayerSection } from './layer-section'
import {
  type DropAnchor,
  layersInSection,
  type NudgeDirection,
  resolveLayerDrop,
  resolveLayerNudge,
  SECTION_PLANES,
} from './layer-sections.ts'
import { SignalScope } from '../../utils/signal-scope.ts'

import Template from './layers-page.blp'

GObject.type_ensure(LayerRow.$gtype)
GObject.type_ensure(LayerSection.$gtype)

/**
 * Shape consumed by {@link LayersPage.setLayers}. The list order is the
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
 * Typed view of the signals {@link LayersPage} registers, layered on the
 * parent's own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface LayersPageSignals extends Adw.Bin.SignalSignatures {
  'layer-selected': (layerId: string) => void
  'layer-visibility-toggled': (layerId: string, visible: boolean) => void
  'layer-lock-toggled': (layerId: string, locked: boolean) => void
  'layer-move-requested': (layerId: string, targetId: string, targetIndex: number) => void
  'layer-rename-requested': (layerId: string, name: string) => void
  'layer-duplicate-requested': (layerId: string) => void
  'layer-delete-requested': (layerId: string) => void
}

/**
 * Inspector's "Layers" page: three fixed {@link LayerSection}s — Above
 * the hero / At hero height / Below the hero — each a `boxed-list` of
 * {@link LayerRow}s in draw order (top row draws on top) over its own
 * "Add a layer" row, because the plane a new layer lands on is the
 * section it was asked from. Simple view hides those three and shows
 * one page-level "Add a layer" that targets the active layer's plane.
 *
 * Every row carries a "⋯" menu — Rename, Duplicate, Move up, Move
 * down, Move to plane ▸, Delete — built here, so the row stays a view
 * and this page stays the only thing that knows the layer array. Move
 * up / down / to-plane are expressed as `layer-move-requested`: the
 * host already turns a plane + array index into a reorder command.
 *
 * Emits:
 * - `layer-selected::<id>` when a row is activated.
 * - `layer-visibility-toggled::<id, visible>` when a row's eye toggle flips.
 * - `layer-lock-toggled::<id, locked>` for the lock toggle.
 * - `layer-move-requested::<id, plane, index>` when a row is dropped or
 *   nudged — `plane` is the section it landed in, `index` the array
 *   position (`layer-sections.ts`); the host turns that into a reorder
 *   or a change-of-plane command.
 * - `layer-rename-requested::<id, name>` once an inline rename commits.
 * - `layer-duplicate-requested::<id>` / `layer-delete-requested::<id>`.
 */
// Two different `visible` live in this file. `LayerDescriptor.visible` is
// LAYER DATA and is decided ONLY by the engine's `isLayerDataVisible`
// (absent = visible). Every other `.visible` below is the `LayerRow`
// GObject property — the eye toggle's UI state, whose absent-means-hidden
// GTK default is correct and unrelated. Each of those carries a
// `layer-visibility-ok:` marker so the repo guard can tell them apart.
export class LayersPage extends Adw.Bin {
  declare _section_overlay: LayerSection
  declare _section_hero: LayerSection
  declare _section_ground: LayerSection
  declare _simple_add_list: Gtk.ListBox
  declare _simple_add_row: Adw.ButtonRow

  private _layers: Map<string, { row: LayerBoxRow; widget: LayerRow; plane: LayerPlane }> = new Map()
  private _descriptors: LayerDescriptor[] = []
  private _activeId: string | null = null
  private _heroPaintable: Gdk.Paintable | null = null
  private _fullView = true
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
        GTypeName: 'PixelRpgLayersPage',
        Template,
        InternalChildren: ['section_overlay', 'section_hero', 'section_ground', 'simple_add_list', 'simple_add_row'],
        Properties: {
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full View',
            'Whether the advanced UI tier is on',
            GObject.ParamFlags.READWRITE,
            true,
          ),
        },
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
          // An inline rename committed (layerId, the new name).
          'layer-rename-requested': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING],
          },
          'layer-duplicate-requested': { param_types: [GObject.TYPE_STRING] },
          'layer-delete-requested': { param_types: [GObject.TYPE_STRING] },
        },
      },
      LayersPage,
    )
  }

  declare connect: GObject.SignalMethods<this, LayersPageSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, LayersPageSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, LayersPageSignals>['emit']

  constructor() {
    super()
    // Drop targets are controllers: install once per section, for the
    // widget's lifetime (rows are rebuilt on every `setLayers`, the
    // sections are not).
    for (const [section, plane] of this._sections()) this._installDropTarget(section, plane)
    // The empty string is `win.new-layer`'s "wherever the active layer
    // is" — Simple view does not name a plane, it just adds one more.
    this._simple_add_row.set_action_target_value(GLib.Variant.new_string(''))
    this._applyAddRows()
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
   * Whether the advanced tier is on. Full view puts an "Add a layer"
   * row in each of the three sections, so the plane is chosen by which
   * button was pressed; Simple view offers one at the bottom of the
   * page that adds next to the active layer.
   */
  get fullView(): boolean {
    return this._fullView
  }

  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this.notify('full-view')
    this._applyAddRows()
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
  }

  /** Put the "Add a layer" rows where the current tier wants them. */
  private _applyAddRows(): void {
    for (const [section, plane] of this._sections()) {
      section.addTarget = this._fullView ? GLib.Variant.new_string(plane) : null
    }
    this._simple_add_list.set_visible(!this._fullView)
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
    row.connect('rename-committed', (_row: LayerRow, name: string) => {
      this.emit('layer-rename-requested', layer.id, name)
    })
    this._installDragSource(row, layer.id)
    // Built per rebuild, not once: which items are sensitive depends on
    // the layer's place in the current array (and Delete on how many
    // layers are left).
    this._installRowMenu(row, layer.id, plane)

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
   * The row's "⋯" menu. The items are actions in a group private to
   * this row (prefix `layer`), the same per-widget pattern
   * `GalleryCard` uses: a menu item needs an action, and these are
   * per-row commands that have no business in the window's action map.
   */
  private _installRowMenu(row: LayerRow, layerId: string, plane: LayerPlane): void {
    const group = new Gio.SimpleActionGroup()
    const add = (name: string, activate: () => void, enabled = true) => {
      const action = new Gio.SimpleAction({ name, enabled })
      action.connect('activate', activate)
      group.add_action(action)
      return action
    }

    add('rename', () => row.beginRename())
    add('duplicate', () => this.emit('layer-duplicate-requested', layerId))
    // A map always keeps one layer, so the last one's item is dead.
    add('delete', () => this.emit('layer-delete-requested', layerId), this._descriptors.length > 1)
    add('move-up', () => this._nudge(layerId, 'up'), resolveLayerNudge(this._descriptors, layerId, 'up') !== null)
    add('move-down', () => this._nudge(layerId, 'down'), resolveLayerNudge(this._descriptors, layerId, 'down') !== null)

    const setPlane = new Gio.SimpleAction({
      name: 'set-plane',
      parameter_type: GLib.VariantType.new('s'),
    })
    setPlane.connect('activate', (_action: Gio.SimpleAction, target: GLib.Variant | null) => {
      const next = target?.get_string()[0] as LayerPlane | undefined
      if (!next) return
      const drop = resolveLayerDrop(this._descriptors, layerId, next, null)
      if (drop) this.emit('layer-move-requested', layerId, drop.plane, drop.index)
    })
    group.add_action(setPlane)

    row.insert_action_group('layer', group)
    row.menuModel = this._buildRowMenu(plane)
  }

  /**
   * Rename / Duplicate · the three move commands · Delete, in three
   * sections so the destructive one sits apart. "Move to plane ▸"
   * lists the OTHER two planes only: one parameterised action cannot
   * be insensitive for a single value, and a plane the layer is
   * already on would be a no-op item.
   */
  private _buildRowMenu(plane: LayerPlane): Gio.Menu {
    const menu = new Gio.Menu()

    const edit = new Gio.Menu()
    edit.append(_('Rename'), 'layer.rename')
    edit.append(_('Duplicate'), 'layer.duplicate')
    menu.append_section(null, edit)

    const move = new Gio.Menu()
    move.append(_('Move up'), 'layer.move-up')
    move.append(_('Move down'), 'layer.move-down')
    const planes = new Gio.Menu()
    for (const other of SECTION_PLANES) {
      if (other === plane) continue
      planes.append(this._sectionFor(other).title, `layer.set-plane('${other}')`)
    }
    move.append_submenu(_('Move to plane'), planes)
    menu.append_section(null, move)

    const danger = new Gio.Menu()
    danger.append(_('Delete'), 'layer.delete')
    menu.append_section(null, danger)

    return menu
  }

  /** One step up or down inside the layer's own section. */
  private _nudge(layerId: string, direction: NudgeDirection): void {
    const drop = resolveLayerNudge(this._descriptors, layerId, direction)
    if (!drop) return
    this.emit('layer-move-requested', layerId, drop.plane, drop.index)
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

GObject.type_ensure(LayersPage.$gtype)
