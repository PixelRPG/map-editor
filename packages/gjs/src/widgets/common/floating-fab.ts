import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'

import Template from './floating-fab.blp'

/**
 * Bottom-right floating accent pill — a generalised Floating Action
 * Button for editor canvases.
 *
 * A `Gtk.Button` wrapped in the same `toolbar` + `osd` Box every other
 * floating chrome widget uses, so the pill inherits identical height /
 * padding / radius / shadow. `floating-fab-frame` overrides the OSD
 * background to a translucent accent color and strips the inner
 * button's own background so the whole pill reads as one accent
 * surface — see `floating-fab.css`.
 *
 * The four template-bound properties (`label`, `icon-name`,
 * `action-name`, `tooltip-text`) cover the primary call-to-action use
 * case. Consumers that need extra state (e.g. play/pause toggle in the
 * scene editor) wrap this widget and mutate those properties on state
 * change — see `FloatingPlay`.
 *
 * Bottom-right intentionally: top-right would clash with the window-
 * close button's visual gravity; bottom-right is the conventional spot
 * for a primary action floating on top of an editing surface.
 */
export class FloatingFab extends Adw.Bin {
  declare _button: Gtk.Button
  declare _button_content: Adw.ButtonContent

  private _label = ''
  private _iconName = ''
  private _actionName = ''

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgFloatingFab',
        Template,
        InternalChildren: ['button', 'button_content'],
        Properties: {
          label: GObject.ParamSpec.string(
            'label',
            'Label',
            'Text label shown next to the icon inside the FAB button',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'icon-name': GObject.ParamSpec.string(
            'icon-name',
            'Icon name',
            'Icon name shown next to the label inside the FAB button',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'action-name': GObject.ParamSpec.string(
            'action-name',
            'Action name',
            'GAction name (e.g. `win.new-scene`) triggered when the FAB is clicked',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          // `tooltip-text` is inherited from `Gtk.Widget` — re-declaring
          // it as a custom ParamSpec would collide at class-registration
          // time. The `.blp` already binds the inner button's
          // `tooltip-text` to `template.tooltip-text` (the inherited
          // property) which is the desired behaviour.
        },
      },
      FloatingFab,
    )
  }

  /** The inner `Gtk.Button` — exposed so consumers can connect extra signals. */
  get button(): Gtk.Button {
    return this._button
  }

  // Defensive `?? ''` on the getters: GObject reads these properties
  // via the template-binding machinery DURING `super()` (template-init
  // happens before TS class-field initialisers run), so `this._label`
  // is still `undefined` at first read. Adwaita then fails an internal
  // `label != NULL` assertion on `Adw.ButtonContent` with no further
  // context. Same pattern other widgets in this package use
  // (e.g. `CastView.projectName`).
  get label(): string {
    return this._label ?? ''
  }

  set label(value: string) {
    if (this._label === value) return
    this._label = value
    this.notify('label')
  }

  get iconName(): string {
    return this._iconName ?? ''
  }

  set iconName(value: string) {
    if (this._iconName === value) return
    this._iconName = value
    this.notify('icon-name')
  }

  get actionName(): string {
    return this._actionName ?? ''
  }

  set actionName(value: string) {
    if (this._actionName === value) return
    this._actionName = value
    this.notify('action-name')
  }
}

GObject.type_ensure(FloatingFab.$gtype)
