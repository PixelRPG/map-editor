import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'

import Template from './layer-row.blp'

/**
 * Single row in the Layers tab.
 *
 * Composition: visibility toggle, layer name, tile-count caption, lock
 * toggle. The `active` style class is added when the row represents the
 * editor's active layer.
 *
 * Emits no signals of its own — state is exposed via `visible` /
 * `locked` properties (bidirectional bindings drive the toggle buttons)
 * and consumed by the parent {@link LayersTab}.
 */
export class LayerRow extends Adw.Bin {
  declare _visibility_button: Gtk.ToggleButton
  declare _lock_button: Gtk.ToggleButton

  private _layerName = ''
  private _tileCount = 0
  private _visible = true
  private _locked = false
  private _active = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgLayerRow',
        Template,
        InternalChildren: ['visibility_button', 'lock_button'],
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
        },
      },
      LayerRow,
    )
  }

  constructor(
    params: Partial<{
      layerName: string
      tileCount: number
      visible: boolean
      locked: boolean
      active: boolean
    }> = {},
  ) {
    super()
    if (params.layerName !== undefined) this.layerName = params.layerName
    if (params.tileCount !== undefined) this.tileCount = params.tileCount
    if (params.visible !== undefined) this.visible = params.visible
    if (params.locked !== undefined) this.locked = params.locked
    if (params.active !== undefined) this.active = params.active
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
}

GObject.type_ensure(LayerRow.$gtype)
