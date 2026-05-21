import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'

const ACCENT_FALLBACK = '#3584e4'
const ON_ACCENT_FALLBACK = '#ffffff'

/**
 * Project hero icon — a rounded-square chip painted in the accent color
 * with a compact compass-rose glyph centred inside.
 *
 * Used by the {@link ModeRail} library sidebar's hero block. The `size`
 * property scales the entire composition. The accent color tracks the
 * libadwaita `@accent_bg_color` style binding when available, otherwise
 * falls back to the default Adwaita blue.
 */
export class ProjectHeroIcon extends Gtk.Widget {
  private _size: number = 64

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgProjectHeroIcon',
        Properties: {
          size: GObject.ParamSpec.int(
            'size',
            'Size',
            'Side length of the icon in pixels',
            GObject.ParamFlags.READWRITE,
            12,
            512,
            64,
          ),
        },
      },
      ProjectHeroIcon,
    )
  }

  constructor(params: Partial<{ size: number }> = {}) {
    super()
    if (params.size !== undefined) this.size = params.size
    this.width_request = this._size
    this.height_request = this._size
  }

  get size(): number {
    return this._size ?? 64
  }

  set size(value: number) {
    if (this._size === value) return
    this._size = value
    this.width_request = value
    this.height_request = value
    this.notify('size')
    this.queue_draw()
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const size = this._size
    const radius = Math.max(6, size * 0.18)

    const rect = new Graphene.Rect()
    rect.init(0, 0, size, size)

    const accent = this._namedColor('accent_bg_color', ACCENT_FALLBACK)
    const onAccent = this._namedColor('accent_fg_color', ON_ACCENT_FALLBACK)

    const rounded = new Gsk.RoundedRect()
    rounded.init_from_rect(rect, radius)
    snapshot.push_rounded_clip(rounded)
    snapshot.append_color(accent, rect)
    snapshot.pop()

    const cx = size / 2
    const cy = size / 2
    const armLength = size * 0.34
    const armWidth = size * 0.08

    const drawArm = (vertical: boolean): void => {
      const armRect = new Graphene.Rect()
      armRect.init(
        vertical ? cx - armWidth / 2 : cx - armLength,
        vertical ? cy - armLength : cy - armWidth / 2,
        vertical ? armWidth : armLength * 2,
        vertical ? armLength * 2 : armWidth,
      )
      const rr = new Gsk.RoundedRect()
      rr.init_from_rect(armRect, armWidth / 2)
      snapshot.push_rounded_clip(rr)
      snapshot.append_color(onAccent, armRect)
      snapshot.pop()
    }
    drawArm(true)
    drawArm(false)

    const discRadius = size * 0.1
    const discRect = new Graphene.Rect()
    discRect.init(cx - discRadius, cy - discRadius, discRadius * 2, discRadius * 2)
    const discRounded = new Gsk.RoundedRect()
    discRounded.init_from_rect(discRect, discRadius)
    snapshot.push_rounded_clip(discRounded)
    snapshot.append_color(accent, discRect)
    snapshot.pop()
  }

  vfunc_measure(_orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    return [this._size, this._size, -1, -1]
  }

  private _namedColor(name: string, fallback: string): Gdk.RGBA {
    try {
      const ctx = this.get_style_context()
      const [found, color] = ctx.lookup_color(name)
      if (found) return color
    } catch {
      // GTK4 deprecation may turn lookup_color into a no-op; fall back.
    }
    const rgba = new Gdk.RGBA()
    rgba.parse(fallback)
    return rgba
  }
}

GObject.type_ensure(ProjectHeroIcon.$gtype)
