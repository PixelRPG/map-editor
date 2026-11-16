import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'

import { fitSheetThumbnail } from './sheet-thumbnail.geometry.ts'

/** Edge length (px) of a gallery-card sheet thumbnail. */
export const SHEET_THUMB_PX = 160

/**
 * A tileset thumbnail that shows the sheet it is a thumbnail OF: the
 * whole image scaled to fit, centred, aspect preserved — never a
 * top-left crop with a grid drawn over it, which said nothing about the
 * other three quarters of the file (REDESIGN § 4.4).
 *
 * The scaling filter follows § 7 and is why this is a `Gtk.Widget`
 * rather than a `Gtk.Picture`: a picture scales with one fixed filter,
 * so a small sheet enlarged into the card came out blurred. Here the
 * fit decides — a downscale is trilinear, an upscale is clamped to a
 * whole factor and drawn nearest-neighbour, so pixel art stays pixel
 * art. One `append_scaled_texture` of the original texture, no
 * intermediate pixbuf and no second resample.
 *
 * Fed via {@link setSheet}; a `null` texture draws nothing, so the host
 * decides what an unloadable sheet looks like.
 */
export class SheetThumbnail extends Gtk.Widget {
  private _texture: Gdk.Texture | null = null
  private _boxWidth: number
  private _boxHeight: number

  static {
    GObject.registerClass({ GTypeName: 'PixelRpgSheetThumbnail' }, SheetThumbnail)
  }

  constructor(box: { width?: number; height?: number } = {}) {
    super()
    this._boxWidth = box.width ?? SHEET_THUMB_PX
    this._boxHeight = box.height ?? box.width ?? SHEET_THUMB_PX
  }

  /** Show `texture` whole, or empty the thumbnail with `null`. */
  setSheet(texture: Gdk.Texture | null): void {
    this._texture = texture
    this.queue_draw()
  }

  vfunc_measure(orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    // Minimum == natural: the box is the thumbnail's whole point, and a
    // squeezed one would scale differently from its neighbours in the
    // same gallery row.
    const size = orientation === Gtk.Orientation.HORIZONTAL ? this._boxWidth : this._boxHeight
    return [size, size, -1, -1]
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const texture = this._texture
    if (!texture) return
    const fit = fitSheetThumbnail(this.get_width(), this.get_height(), texture.get_width(), texture.get_height())
    if (!fit) return
    const dest = new Graphene.Rect()
    dest.init(fit.x, fit.y, fit.width, fit.height)
    snapshot.append_scaled_texture(texture, fit.nearest ? Gsk.ScalingFilter.NEAREST : Gsk.ScalingFilter.TRILINEAR, dest)
  }
}

GObject.type_ensure(SheetThumbnail.$gtype)
