import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'

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
 */
export class FloatingPlay extends Adw.Bin {
  declare _play_button: Gtk.Button

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgFloatingPlay',
        Template,
        InternalChildren: ['play_button'],
      },
      FloatingPlay,
    )
  }
}

GObject.type_ensure(FloatingPlay.$gtype)
