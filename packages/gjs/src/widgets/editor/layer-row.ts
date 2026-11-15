import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import type Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { LayerPlane } from '@pixelrpg/engine'
import { DepthGlyph } from './depth-glyph'

import Template from './layer-row.blp'

GObject.type_ensure(DepthGlyph.$gtype)

/**
 * Typed view of the signals {@link LayerRow} registers, layered on the
 * parent's own so inherited signals keep their argument lists — the
 * same shape {@link LayersPage} uses, for the same `@girs` 5 reason.
 */
export interface LayerRowSignals extends Adw.Bin.SignalSignatures {
  'rename-committed': (name: string) => void
}

/**
 * Single row in the Layers page.
 *
 * Composition: visibility toggle, depth glyph (the layer's plane), layer
 * name (a label that swaps for an entry during a rename), tile-count
 * caption, lock toggle, and a "⋯" button carrying the per-row command
 * menu the parent installs. The `active` style class is added when the
 * row represents the editor's active layer.
 *
 * Flag state is exposed via the `visible` / `locked` properties
 * (bidirectional bindings drive the toggle buttons). The only signal is
 * `rename-committed::<name>`: the inline rename is view state the row
 * owns, and the committed name is the one thing the host has to turn
 * into a command.
 */
export class LayerRow extends Adw.Bin {
  declare _visibility_button: Gtk.ToggleButton
  declare _lock_button: Gtk.ToggleButton
  declare _glyph: DepthGlyph
  declare _name_stack: Gtk.Stack
  declare _name_entry: Gtk.Entry
  declare _menu_button: Gtk.MenuButton

  private _layerName = ''
  private _tileCount = 0
  private _visible = true
  private _locked = false
  private _active = false
  private _plane: LayerPlane = 'ground'

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgLayerRow',
        Template,
        InternalChildren: ['visibility_button', 'lock_button', 'glyph', 'name_stack', 'name_entry', 'menu_button'],
        Signals: {
          // The inline rename was confirmed with Enter. Cancelling (Esc,
          // focus lost, an unchanged name) emits nothing.
          'rename-committed': { param_types: [GObject.TYPE_STRING] },
        },
        Properties: {
          'layer-name': GObject.ParamSpec.string(
            'layer-name',
            'Layer Name',
            'Display name of the layer',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'tile-count': GObject.ParamSpec.int(
            'tile-count',
            'Tile Count',
            'Number of tiles in the layer',
            GObject.ParamFlags.READWRITE,
            0,
            2_147_483_647,
            0,
          ),
          'tile-count-text': GObject.ParamSpec.string(
            'tile-count-text',
            'Tile Count Text',
            'Formatted count badge',
            GObject.ParamFlags.READABLE,
            '0',
          ),
          visible: GObject.ParamSpec.boolean(
            'visible',
            'Visible',
            'Whether the layer is rendered',
            GObject.ParamFlags.READWRITE,
            true,
          ),
          'visibility-icon': GObject.ParamSpec.string(
            'visibility-icon',
            'Visibility Icon',
            'Icon shown on the visibility toggle',
            GObject.ParamFlags.READABLE,
            'view-reveal-symbolic',
          ),
          locked: GObject.ParamSpec.boolean(
            'locked',
            'Locked',
            'Whether the layer is locked for editing',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'lock-icon': GObject.ParamSpec.string(
            'lock-icon',
            'Lock Icon',
            'Icon shown on the lock toggle',
            GObject.ParamFlags.READABLE,
            'changes-allow-symbolic',
          ),
          active: GObject.ParamSpec.boolean(
            'active',
            'Active',
            'Whether the row represents the active editor layer',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          plane: GObject.ParamSpec.string(
            'plane',
            'Plane',
            'The plane the layer draws on: ground, hero or overlay',
            GObject.ParamFlags.READWRITE,
            'ground',
          ),
        },
      },
      LayerRow,
    )
  }

  declare connect: GObject.SignalMethods<this, LayerRowSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, LayerRowSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, LayerRowSignals>['emit']

  constructor(
    params: Partial<{
      layerName: string
      tileCount: number
      visible: boolean
      locked: boolean
      active: boolean
      plane: LayerPlane
    }> = {},
  ) {
    super()
    if (params.layerName !== undefined) this.layerName = params.layerName
    if (params.tileCount !== undefined) this.tileCount = params.tileCount
    if (params.visible !== undefined) this.visible = params.visible
    if (params.locked !== undefined) this.locked = params.locked
    if (params.active !== undefined) this.active = params.active
    if (params.plane !== undefined) this.plane = params.plane
    // Both are lifetime-bound to this widget's own children and
    // controllers — nothing external to release, so no SignalScope.
    this._installRename()
    this._installMenuGestures()
  }

  /**
   * The per-row command menu, or `null` to hide the "⋯" button. The
   * parent owns the model and the action group behind it; the row only
   * carries them.
   */
  set menuModel(value: Gio.MenuModel | null) {
    this._menu_button.set_menu_model(value)
    this._menu_button.set_visible(value !== null)
  }

  /**
   * Swap the name label for an entry seeded with the current name, as
   * `Adw.EntryRow` does: `Enter` emits `rename-committed`, `Esc` or
   * losing focus puts the label back unchanged.
   */
  beginRename(): void {
    this._name_entry.set_text(this.layerName)
    this._name_stack.set_visible_child_name('entry')
    this._name_entry.grab_focus()
    this._name_entry.select_region(0, -1)
  }

  get plane(): LayerPlane {
    return this._plane ?? 'ground'
  }

  set plane(value: LayerPlane) {
    if (this._plane === value) return
    this._plane = value
    this.notify('plane')
  }

  /** The hero sprite drawn in the row's glyph (`null` = silhouette). */
  set heroPaintable(value: Gdk.Paintable | null) {
    this._glyph.heroPaintable = value
  }

  get layerName(): string {
    return this._layerName ?? ''
  }

  set layerName(value: string) {
    if (this._layerName === value) return
    this._layerName = value
    this.notify('layer-name')
  }

  get tileCount(): number {
    return this._tileCount ?? 0
  }

  set tileCount(value: number) {
    if (this._tileCount === value) return
    this._tileCount = value
    this.notify('tile-count')
    this.notify('tile-count-text')
  }

  get tileCountText(): string {
    return (this._tileCount ?? 0).toString()
  }

  get visible(): boolean {
    return this._visible ?? true
  }

  set visible(value: boolean) {
    if (this._visible === value) return
    this._visible = value
    this.notify('visible')
    this.notify('visibility-icon')
  }

  get visibilityIcon(): string {
    return (this._visible ?? true) ? 'view-reveal-symbolic' : 'view-conceal-symbolic'
  }

  get locked(): boolean {
    return this._locked ?? false
  }

  set locked(value: boolean) {
    if (this._locked === value) return
    this._locked = value
    this.notify('locked')
    this.notify('lock-icon')
  }

  get lockIcon(): string {
    return (this._locked ?? false) ? 'changes-prevent-symbolic' : 'changes-allow-symbolic'
  }

  get active(): boolean {
    return this._active ?? false
  }

  set active(value: boolean) {
    if (this._active === value) return
    this._active = value
    this.notify('active')
    if (value) this.add_css_class('accent')
    else this.remove_css_class('accent')
  }

  private _installRename(): void {
    this._name_entry.connect('activate', () => {
      const next = this._name_entry.get_text().trim()
      this._endRename()
      if (next.length === 0 || next === this.layerName) return
      this.emit('rename-committed', next)
    })

    const keys = new Gtk.EventControllerKey()
    keys.connect('key-pressed', (_controller: Gtk.EventControllerKey, keyval: number) => {
      if (keyval !== Gdk.KEY_Escape) return false
      this._endRename()
      return true
    })
    this._name_entry.add_controller(keys)

    // Losing focus cancels rather than commits: the row is inside a
    // list that scrolls and re-selects under a thumb, so an accidental
    // tap elsewhere must not rename anything.
    const focus = new Gtk.EventControllerFocus()
    focus.connect('leave', () => this._endRename())
    this._name_entry.add_controller(focus)
  }

  private _endRename(): void {
    this._name_stack.set_visible_child_name('label')
  }

  /**
   * Long-press and secondary click open the same menu the "⋯" button
   * does. On phone the thumb lands on the row, not on a 44 px button at
   * its end; on desktop right-click is the reflex. Both are additions —
   * the button stays the discoverable path.
   */
  private _installMenuGestures(): void {
    const longPress = new Gtk.GestureLongPress()
    longPress.connect('pressed', () => this._popupMenu())
    this.add_controller(longPress)

    const secondary = new Gtk.GestureClick({ button: Gdk.BUTTON_SECONDARY })
    secondary.connect('pressed', () => this._popupMenu())
    this.add_controller(secondary)
  }

  private _popupMenu(): void {
    if (!this._menu_button.get_visible()) return
    this._menu_button.popup()
  }
}

GObject.type_ensure(LayerRow.$gtype)
