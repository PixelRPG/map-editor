import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'

import { DEFAULT_PEER_COLOR } from '@pixelrpg/engine'

/** Diameter of a dot in a list row — the size Together's People rows use. */
export const COLOUR_DOT_ROW_PX = 12

/**
 * A participant's colour, as a filled disc.
 *
 * A drawn circle rather than an `Adw.Avatar` with a custom style: the
 * colour is data (it arrives over awareness, or out of the Preferences
 * palette), and a per-peer CSS class would mean generating a stylesheet
 * at run time. Same reasoning as the roster chip's avatar stack, one
 * size down.
 */
export class ColourDot extends Gtk.Widget {
  static {
    GObject.registerClass({ GTypeName: 'PixelRpgColourDot' }, ColourDot)
  }

  private _rgba = new Gdk.RGBA()

  constructor(
    color: string,
    private readonly _size: number = COLOUR_DOT_ROW_PX,
  ) {
    super({ valign: Gtk.Align.CENTER, halign: Gtk.Align.CENTER })
    this.setColor(color)
  }

  /** Repaint in `color`, falling back to the neutral peer grey. */
  setColor(color: string): void {
    const rgba = new Gdk.RGBA()
    if (!rgba.parse(color)) rgba.parse(DEFAULT_PEER_COLOR)
    this._rgba = rgba
    this.queue_draw()
  }

  vfunc_measure(_orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    return [this._size, this._size, -1, -1]
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const rect = new Graphene.Rect()
    rect.init(0, 0, this._size, this._size)
    const rounded = new Gsk.RoundedRect()
    rounded.init_from_rect(rect, this._size / 2)
    snapshot.push_rounded_clip(rounded)
    snapshot.append_color(this._rgba, rect)
    snapshot.pop()
  }
}

GObject.type_ensure(ColourDot.$gtype)
