import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import Template from './floating-assistant.blp'

/**
 * Bottom-left floating presence pill for the in-process AI collaborator
 * (see `docs/concepts/ai-collaborator.md`). Mirrors {@link FloatingPlay}'s
 * OSD chrome but carries presence + a user pause/resume control:
 *
 *   - `active` — show/hide the pill. ApplicationWindow flips it on the
 *     first `SetAssistant*` control call and clears it on `HideAssistant`.
 *   - `paused` — swaps the button icon/tooltip between pause and resume.
 *     The button drives the `win.toggle-assistant-paused` stateful action;
 *     the window's change-state handler pauses the engine + flips this.
 *
 * The colour-coded cursor on the canvas conveys *where* the AI is; this
 * pill conveys *that* it's here and gives the user a one-click stop.
 */
export class FloatingAssistant extends Adw.Bin {
  declare _pause_button: Gtk.Button
  declare _name_label: Gtk.Label

  private _active = false
  private _paused = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgFloatingAssistant',
        Template,
        InternalChildren: ['pause_button', 'name_label'],
        Properties: {
          active: GObject.ParamSpec.boolean(
            'active',
            'Active',
            'Whether the AI assistant is present (pill shown)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          paused: GObject.ParamSpec.boolean(
            'paused',
            'Paused',
            'Whether the user has paused the assistant',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      FloatingAssistant,
    )
  }

  get active(): boolean {
    return this._active
  }

  set active(value: boolean) {
    if (this._active === value) return
    this._active = value
    this.set_visible(value)
    this.notify('active')
  }

  get paused(): boolean {
    return this._paused
  }

  set paused(value: boolean) {
    if (this._paused === value) return
    this._paused = value
    this._pause_button.iconName = value ? 'media-playback-start-symbolic' : 'media-playback-pause-symbolic'
    this._pause_button.tooltipText = value ? _('Resume the assistant') : _('Pause the assistant')
    this.notify('paused')
  }

  /** Set the displayed collaborator name (from `SetAssistantInfo`). */
  setName(name: string): void {
    this._name_label.label = name
  }
}

GObject.type_ensure(FloatingAssistant.$gtype)
