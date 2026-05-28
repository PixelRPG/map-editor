import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import Template from './floating-play.blp'

/**
 * Bottom-right floating "Play" pill — the editor's primary
 * Call-to-Action moved out of the header into the canvas overlay.
 *
 * Wraps a single `Gtk.Button` bound to `win.play`. Lives as an
 * `[overlay]` child on the scene editor's `Gtk.Overlay` alongside
 * the other OSD chrome (tool rail, history, zoom, context chip)
 * so the editor's main canvas surface stays headerbar-light —
 * the Gradia-style "no chrome, just controls floating over the
 * artwork" feel.
 *
 * Bottom-right intentionally: top-right would clash with the
 * window-close button's visual gravity; bottom-right is the
 * conventional spot for a primary action floating on top of an
 * editing surface.
 *
 * The `playing` property reflects the `win.play` action's state —
 * when true, the icon + label swap to "pause" so the user knows
 * clicking again will exit playtest. ApplicationWindow updates
 * this via `setPlaying()` from the action's change-state handler.
 */
export class FloatingPlay extends Adw.Bin {
  declare _play_button: Gtk.Button
  declare _icon: Gtk.Image
  declare _label: Gtk.Label

  private _playing = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgFloatingPlay',
        Template,
        InternalChildren: ['play_button', 'icon', 'label'],
        Properties: {
          playing: GObject.ParamSpec.boolean(
            'playing',
            'Playing',
            'Whether the editor is currently in runtime / playtest mode',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      FloatingPlay,
    )
  }

  get playing(): boolean {
    return this._playing
  }

  set playing(value: boolean) {
    if (this._playing === value) return
    this._playing = value
    this._icon.set_from_icon_name(value ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic')
    this._label.set_label(value ? _('Pause') : _('Play'))
    this._play_button.set_tooltip_text(value ? _('Pause playtest') : _('Play'))
    this.notify('playing')
  }
}

GObject.type_ensure(FloatingPlay.$gtype)
