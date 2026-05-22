import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'

import Template from './floating-history.blp'

/**
 * Top-left OSD pill exposing the editor's undo / redo actions.
 *
 * Lives as an `[overlay]` child on the scene editor's `Gtk.Overlay`
 * alongside the tool rail, zoom OSD, and context chip — keeps the
 * window header free of editor-specific actions so it stays a clean
 * "where am I?" surface.
 *
 * Buttons fire `win.undo` / `win.redo`; the host registers those
 * actions and decides what they do.
 */
export class FloatingHistory extends Adw.Bin {
  declare _undo_button: Gtk.Button
  declare _redo_button: Gtk.Button

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgFloatingHistory',
        Template,
        InternalChildren: ['undo_button', 'redo_button'],
      },
      FloatingHistory,
    )
  }
}

GObject.type_ensure(FloatingHistory.$gtype)
