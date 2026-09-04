import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'

/** Corner radius (px) of the fallback colour swatch. */
const SWATCH_RADIUS = 6

/** Colour used when a descriptor carries neither a paintable nor a parsable colour. */
const SWATCH_FALLBACK_COLOR = '#9aa0a6'

/**
 * A `Gtk.Widget` that paints a solid-coloured rounded rectangle. Used as
 * the swatch when a tile descriptor has no `Gdk.Paintable`.
 */
export class TileSwatch extends Gtk.Widget {
  private _color: Gdk.RGBA

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTileSwatch',
      },
      TileSwatch,
    )
  }

  constructor(color: string) {
    super()
    this._color = new Gdk.RGBA()
    if (!this._color.parse(color)) this._color.parse(SWATCH_FALLBACK_COLOR)
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const rect = new Graphene.Rect()
    rect.init(0, 0, this.get_width(), this.get_height())
    const rounded = new Gsk.RoundedRect()
    rounded.init_from_rect(rect, SWATCH_RADIUS)
    snapshot.push_rounded_clip(rounded)
    snapshot.append_color(this._color, rect)
    snapshot.pop()
  }
}

/**
 * Build the swatch widget for one palette cell: a `Gtk.Picture` for a
 * paintable, else a solid-colour {@link TileSwatch}. The single shared
 * renderer for tile-like previews — `TilePalette` cells and the Objects
 * tab's placement rows both go through here, so a sprite looks identical
 * wherever it appears.
 */
export function createSwatchWidget(
  desc: { color?: string; paintable?: Gdk.Paintable | null },
  width: number,
  height: number,
  contentFit: 'fill' | 'contain' = 'fill',
): Gtk.Widget {
  let swatch: Gtk.Widget
  if (desc.paintable) {
    const picture = new Gtk.Picture()
    picture.set_paintable(desc.paintable)
    picture.set_content_fit(contentFit === 'contain' ? Gtk.ContentFit.CONTAIN : Gtk.ContentFit.FILL)
    swatch = picture
  } else {
    swatch = new TileSwatch(desc.color ?? SWATCH_FALLBACK_COLOR)
  }
  swatch.set_size_request(width, height)
  return swatch
}

GObject.type_ensure(TileSwatch.$gtype)
