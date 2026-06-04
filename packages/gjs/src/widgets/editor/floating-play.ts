import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import Template from './floating-play.blp'

/**
 * Bottom-right floating "Play" pill — the editor's primary
 * Call-to-Action over the canvas overlay.
 *
 * A `Gtk.Button` bound to `win.play`, wrapped in the same
 * `toolbar` + `osd` Box every other floating chrome widget uses,
 * so the pill inherits identical height / padding / radius /
 * shadow. `floating-play-frame` overrides the OSD background to a
 * translucent accent color, and `floating-play-button` strips the
 * inner button's own background so the whole pill reads as one
 * accent surface — see `scene-editor.css`.
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
  declare _button_content: Adw.ButtonContent

  private _playing = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgFloatingPlay',
        Template,
        InternalChildren: ['play_button', 'button_content'],
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
    this._button_content.set_icon_name(value ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic')
    this._button_content.set_label(value ? _('Pause') : _('Play'))
    this._play_button.set_tooltip_text(value ? _('Pause playtest') : _('Play'))
    this.notify('playing')
  }
}

GObject.type_ensure(FloatingPlay.$gtype)
