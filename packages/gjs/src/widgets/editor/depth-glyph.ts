import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import {
  type DepthGlyphGeometry,
  depthGlyphGeometry,
  GLYPH_PLANES,
  GLYPH_SIZES,
  type GlyphPlane,
  type GlyphRect,
  highlightRect,
} from './depth-glyph.geometry.ts'

/**
 * The three plane colours are FIXED, not the accent: under a colourful
 * accent in a dark theme all three would look the same. Adwaita's named
 * palette, looked up through the style context with hex fallbacks the
 * way `TeleportOverlay` resolves the accent.
 */
const PLANE_COLOR: Record<GlyphPlane, { name: string; fallback: string }> = {
  ground: { name: 'green_3', fallback: '#33d17a' },
  hero: { name: 'orange_3', fallback: '#ff7800' },
  overlay: { name: 'blue_3', fallback: '#3584e4' },
}
const FG_FALLBACK = '#000000'
const ACCENT_FALLBACK = '#3584e4'
/**
 * Alpha of the non-highlighted elements, on `@window_fg_color`. The
 * concept names `@card_shade_color`, but that colour is itself only 7 %
 * alpha in the light theme, so a 55 % of it would vanish against a
 * card; a dimmed foreground stays a visible grey slab in both themes,
 * which is what "the other two recede" needs.
 */
const SHADE_ALPHA = 0.3
const SILHOUETTE_ALPHA = 0.85
const OUTLINE_PX = 1

/**
 * Depth glyph — a side view of the hero in a square, with the element
 * of one plane painted in that plane's colour: the ground slab under
 * the hero ("Below the hero"), the block beside the hero's legs ("At
 * hero height"), or the roof slab that cuts the top of the head ("Above
 * the hero"). The one picture that explains what a layer's plane means,
 * shown at 40 px on each Layers-tab section header, 24 px on every row
 * and popover row, and 14 px in the top-bar layer chip.
 *
 * Raw `Gtk.Widget` with a single `vfunc_snapshot` — the pattern of
 * {@link ProjectHeroIcon} (rounded clips + `append_color`) and
 * {@link CollisionPreview} (a paintable fitted into a box). The hero is
 * the project's own player sprite when `hero-paintable` is set, else a
 * filled silhouette. All geometry comes from `depth-glyph.geometry.ts`,
 * whose spec proves the three states stay distinguishable at 14 px.
 */
export class DepthGlyph extends Gtk.Widget {
  private _plane: GlyphPlane = 'ground'
  private _size: number = GLYPH_SIZES.row
  private _heroPaintable: Gdk.Paintable | null = null
  private _active = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgDepthGlyph',
        Properties: {
          plane: GObject.ParamSpec.string(
            'plane',
            'Plane',
            'Which plane is highlighted: ground, hero or overlay',
            GObject.ParamFlags.READWRITE,
            'ground',
          ),
          size: GObject.ParamSpec.int(
            'size',
            'Size',
            'Side length of the glyph in pixels',
            GObject.ParamFlags.READWRITE,
            GLYPH_SIZES.chip,
            64,
            GLYPH_SIZES.row,
          ),
          'hero-paintable': GObject.ParamSpec.object(
            'hero-paintable',
            'Hero Paintable',
            "The project's player sprite; a silhouette is drawn when unset",
            GObject.ParamFlags.READWRITE,
            Gdk.Paintable.$gtype,
          ),
          active: GObject.ParamSpec.boolean(
            'active',
            'Active',
            'Outline the highlighted element in the accent colour',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      DepthGlyph,
    )
  }

  constructor(
    params: Partial<{ plane: GlyphPlane; size: number; heroPaintable: Gdk.Paintable | null; active: boolean }> = {},
  ) {
    super()
    this.halign = Gtk.Align.CENTER
    this.valign = Gtk.Align.CENTER
    if (params.plane !== undefined) this.plane = params.plane
    if (params.size !== undefined) this.size = params.size
    if (params.heroPaintable !== undefined) this.heroPaintable = params.heroPaintable
    if (params.active !== undefined) this.active = params.active
    this.width_request = this._size
    this.height_request = this._size
  }

  get plane(): GlyphPlane {
    return this._plane ?? 'ground'
  }

  set plane(value: GlyphPlane) {
    if (!GLYPH_PLANES.includes(value) || this._plane === value) return
    this._plane = value
    this.notify('plane')
    this.queue_draw()
  }

  get size(): number {
    return this._size ?? GLYPH_SIZES.row
  }

  set size(value: number) {
    if (this._size === value) return
    this._size = value
    this.width_request = value
    this.height_request = value
    this.notify('size')
    this.queue_resize()
    this.queue_draw()
  }

  get heroPaintable(): Gdk.Paintable | null {
    return this._heroPaintable ?? null
  }

  set heroPaintable(value: Gdk.Paintable | null) {
    if (this._heroPaintable === value) return
    this._heroPaintable = value
    this.notify('hero-paintable')
    this.queue_draw()
  }

  get active(): boolean {
    return this._active ?? false
  }

  set active(value: boolean) {
    if (this._active === value) return
    this._active = value
    this.notify('active')
    this.queue_draw()
  }

  vfunc_measure(_orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    return [this._size, this._size, -1, -1]
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const size = this._size
    const g = depthGlyphGeometry(size)
    const plane = this.plane
    const planeColor = this._namedColor(PLANE_COLOR[plane].name, PLANE_COLOR[plane].fallback)
    const fg = this._namedColor('window_fg_color', FG_FALLBACK)
    const shade = withAlpha(fg, SHADE_ALPHA)
    const colorFor = (p: GlyphPlane): Gdk.RGBA => (p === plane ? planeColor : shade)

    // Centre the square inside whatever the layout allocated.
    snapshot.save()
    snapshot.translate(
      new Graphene.Point({
        x: Math.floor((this.get_width() - size) / 2),
        y: Math.floor((this.get_height() - size) / 2),
      }),
    )

    // 1. Ground slab.
    fillRounded(snapshot, g.ground, g.slabRadius, colorFor('ground'))
    // 2. The hero, standing on it.
    this._drawHero(snapshot, g, withAlpha(fg, SILHOUETTE_ALPHA))
    // 3. The block beside the legs, same baseline.
    fillRounded(snapshot, g.hero, g.slabRadius / 2, colorFor('hero'))
    // 4. Roof slab last, so it visibly cuts the top of the head.
    fillRounded(snapshot, g.overlay, g.slabRadius, colorFor('overlay'))
    // 5. Accent outline on the highlighted element when active.
    if (this._active) {
      const target = highlightRect(g, plane)
      const outline = new Gsk.RoundedRect()
      outline.init_from_rect(toRect(target), plane === 'hero' ? g.slabRadius / 2 : g.slabRadius)
      const accent = this._namedColor('accent_bg_color', ACCENT_FALLBACK)
      snapshot.append_border(
        outline,
        [OUTLINE_PX, OUTLINE_PX, OUTLINE_PX, OUTLINE_PX],
        [accent, accent, accent, accent],
      )
    }

    snapshot.restore()
  }

  /** The player sprite fitted into the hero box, feet on the slab; else the silhouette. */
  private _drawHero(snapshot: Gtk.Snapshot, g: DepthGlyphGeometry, silhouette: Gdk.RGBA): void {
    const paintable = this._heroPaintable
    if (paintable) {
      const box = g.heroBox
      const iw = paintable.get_intrinsic_width()
      const ih = paintable.get_intrinsic_height()
      const scale = iw > 0 && ih > 0 ? Math.min(box.w / iw, box.h / ih) : 1
      const w = iw > 0 ? iw * scale : box.w
      const h = ih > 0 ? ih * scale : box.h
      snapshot.save()
      snapshot.translate(new Graphene.Point({ x: box.x + (box.w - w) / 2, y: box.y + box.h - h }))
      paintable.snapshot(snapshot, w, h)
      snapshot.restore()
      return
    }
    const { cx, cy, r } = g.heroHead
    fillRounded(snapshot, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, r, silhouette)
    fillRounded(snapshot, g.heroBody, g.heroBody.w * 0.3, silhouette)
  }

  private _namedColor(name: string, fallback: string): Gdk.RGBA {
    try {
      const [found, color] = this.get_style_context().lookup_color(name)
      if (found) return color
    } catch {
      // GTK4 deprecation may turn lookup_color into a no-op; fall back.
    }
    const rgba = new Gdk.RGBA()
    rgba.parse(fallback)
    return rgba
  }
}

function toRect(r: GlyphRect): Graphene.Rect {
  const rect = new Graphene.Rect()
  rect.init(r.x, r.y, r.w, r.h)
  return rect
}

function fillRounded(snapshot: Gtk.Snapshot, r: GlyphRect, radius: number, color: Gdk.RGBA): void {
  const rect = toRect(r)
  const rounded = new Gsk.RoundedRect()
  rounded.init_from_rect(rect, radius)
  snapshot.push_rounded_clip(rounded)
  snapshot.append_color(color, rect)
  snapshot.pop()
}

function withAlpha(color: Gdk.RGBA, alpha: number): Gdk.RGBA {
  return new Gdk.RGBA({ red: color.red, green: color.green, blue: color.blue, alpha })
}

GObject.type_ensure(DepthGlyph.$gtype)
