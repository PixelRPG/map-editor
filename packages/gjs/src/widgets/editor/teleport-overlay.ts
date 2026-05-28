import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import Pango from '@girs/pango-1.0'
import type { SampleScene, SampleTeleport } from '../../__demo__/world-sample'

const TITLE_BAR_HEIGHT = 24
const ACCENT_FALLBACK = '#3584e4'

const CURVE_OFFSET_MAX = 80
const CURVE_OFFSET_FACTOR = 0.25
const STROKE_WIDTH = 2
const STROKE_DASH: [number, number] = [6, 4]
const OPACITY_NORMAL = 0.85
const OPACITY_DIMMED = 0.25
const SOURCE_RING_RADIUS = 5
const SOURCE_CORE_RADIUS = 3.2
const DEST_RADIUS = 4
const LABEL_FONT_SIZE_PT = 10
const LABEL_PADDING_X = 8
const LABEL_PADDING_Y = 2

interface Endpoint {
  x: number
  y: number
}

/**
 * Vector overlay that draws teleport connections on top of the atlas
 * canvas.
 *
 * Each teleport is rendered as a dashed quadratic Bézier curve from a
 * "door" marker on the source scene tile to a destination marker on
 * the target scene tile, with a labelled pill at the control point.
 * Curve geometry mirrors `option-g-synthesis.jsx` / `world-data.jsx`:
 * - control point biased perpendicular to the midpoint
 * - `offset = min(80, length × 0.25)`
 * - stroke `2px`, dash `[6, 4]`
 *
 * Selection: when `selectedId` is set, non-related teleports dim to
 * 25% opacity.
 *
 * All drawing happens in `vfunc_snapshot` — no SVG, no Cairo offscreen.
 * Labels are rendered with `Pango.Layout` so they pick up the
 * application's font.
 */
export class TeleportOverlay extends Gtk.Widget {
  private _scenes: SampleScene[] = []
  private _teleports: SampleTeleport[] = []
  private _scale = 1
  private _selectedId: string | null = null
  private _accentColor: Gdk.RGBA

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTeleportOverlay',
      },
      TeleportOverlay,
    )
  }

  constructor() {
    super()
    this._accentColor = new Gdk.RGBA()
    this._accentColor.parse(ACCENT_FALLBACK)
    this.can_target = false
    this.set_hexpand(true)
    this.set_vexpand(true)
  }

  setWorld(scenes: SampleScene[], teleports: SampleTeleport[], scale: number = 1): void {
    this._scenes = scenes
    this._teleports = teleports
    this._scale = scale
    this.queue_draw()
  }

  setSelected(id: string | null): void {
    if (this._selectedId === id) return
    this._selectedId = id
    this.queue_draw()
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    if (!this._teleports.length || !this._scenes.length) return

    const byId = new Map<string, SampleScene>()
    for (const s of this._scenes) byId.set(s.id, s)

    const accent = this._lookupAccent()
    const white = new Gdk.RGBA()
    white.parse('#ffffff')

    const stroke = new Gsk.Stroke(STROKE_WIDTH)
    stroke.set_dash(STROKE_DASH)
    stroke.set_line_cap(Gsk.LineCap.ROUND)

    for (const t of this._teleports) {
      const a = this._endpoint(byId, t.from, t.fx, t.fy)
      const b = this._endpoint(byId, t.to, t.tx, t.ty)
      if (!a || !b) continue
      this._drawTeleport(snapshot, t, a, b, stroke, accent, white)
    }
  }

  /** Render one teleport (curve + markers + optional label) into the snapshot. */
  private _drawTeleport(
    snapshot: Gtk.Snapshot,
    t: SampleTeleport,
    a: Endpoint,
    b: Endpoint,
    stroke: Gsk.Stroke,
    accent: Gdk.RGBA,
    white: Gdk.RGBA,
  ): void {
    const involves = this._selectedId ? t.from === this._selectedId || t.to === this._selectedId : true
    const dimmed = this._selectedId != null && !involves
    const control = controlPoint(a, b)

    snapshot.push_opacity(dimmed ? OPACITY_DIMMED : OPACITY_NORMAL)

    // Dashed quadratic Bézier from source to dest.
    const builder = new Gsk.PathBuilder()
    builder.move_to(a.x, a.y)
    builder.quad_to(control.x, control.y, b.x, b.y)
    snapshot.push_stroke(builder.to_path(), stroke)
    snapshot.append_color(accent, this._coverRect())
    snapshot.pop()

    // Source: white core + accent ring. Dest: solid accent disc.
    this._drawDisc(snapshot, a.x, a.y, SOURCE_RING_RADIUS, accent)
    this._drawDisc(snapshot, a.x, a.y, SOURCE_CORE_RADIUS, white)
    this._drawDisc(snapshot, b.x, b.y, DEST_RADIUS, accent)

    if (!dimmed) this._drawLabel(snapshot, control.x, control.y, t.label, accent, white)

    snapshot.pop()
  }

  private _endpoint(
    byId: Map<string, SampleScene>,
    sceneId: string,
    tx: number,
    ty: number,
  ): Endpoint | null {
    const s = byId.get(sceneId)
    if (!s) return null
    const scale = this._scale
    return {
      x: (s.x + (tx + 0.5) * s.tilePx) * scale,
      y: (s.y + (ty + 0.5) * s.tilePx) * scale + TITLE_BAR_HEIGHT,
    }
  }

  private _coverRect(): Graphene.Rect {
    const rect = new Graphene.Rect()
    rect.init(0, 0, this.get_width() || 1, this.get_height() || 1)
    return rect
  }

  private _drawDisc(snapshot: Gtk.Snapshot, cx: number, cy: number, r: number, color: Gdk.RGBA): void {
    const builder = new Gsk.PathBuilder()
    builder.add_circle(new Graphene.Point({ x: cx, y: cy }), r)
    const path = builder.to_path()
    snapshot.push_fill(path, Gsk.FillRule.WINDING)
    const rect = new Graphene.Rect()
    rect.init(cx - r, cy - r, r * 2, r * 2)
    snapshot.append_color(color, rect)
    snapshot.pop()
  }

  private _drawLabel(
    snapshot: Gtk.Snapshot,
    cx: number,
    cy: number,
    text: string,
    bg: Gdk.RGBA,
    fg: Gdk.RGBA,
  ): void {
    const layout = this._layoutFor(text)
    const [w, h] = layout.get_pixel_size()
    const pillW = w + LABEL_PADDING_X * 2
    const pillH = h + LABEL_PADDING_Y * 2
    const pillRect = new Graphene.Rect()
    pillRect.init(cx - pillW / 2, cy - pillH / 2, pillW, pillH)
    const rounded = new Gsk.RoundedRect()
    rounded.init_from_rect(pillRect, pillH / 2)

    snapshot.push_rounded_clip(rounded)
    snapshot.append_color(bg, pillRect)
    snapshot.pop()

    snapshot.save()
    snapshot.translate(new Graphene.Point({ x: cx - w / 2, y: cy - h / 2 }))
    snapshot.append_layout(layout, fg)
    snapshot.restore()
  }

  private _layoutFor(text: string): Pango.Layout {
    const ctx = this.get_pango_context()
    const layout = Pango.Layout.new(ctx)
    const fontDesc = ctx.get_font_description()?.copy() ?? Pango.FontDescription.new()
    fontDesc.set_size(LABEL_FONT_SIZE_PT * Pango.SCALE)
    fontDesc.set_weight(Pango.Weight.BOLD)
    layout.set_font_description(fontDesc)
    layout.set_text(text, -1)
    return layout
  }

  private _lookupAccent(): Gdk.RGBA {
    try {
      const ctx = this.get_style_context()
      const [found, color] = ctx.lookup_color('accent_bg_color')
      if (found) {
        this._accentColor = color
        return color
      }
    } catch {
      /* lookup deprecated — fall through. */
    }
    return this._accentColor
  }
}

/**
 * Quadratic-Bézier control point biased perpendicular to the segment
 * midpoint — `offset = min(80, length × 0.25)`. Mirrors the curve math
 * from the original design exports (`option-g-synthesis.jsx`).
 */
function controlPoint(a: Endpoint, b: Endpoint): Endpoint {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const off = Math.min(CURVE_OFFSET_MAX, len * CURVE_OFFSET_FACTOR)
  return { x: mx - (dy / len) * off, y: my + (dx / len) * off }
}

GObject.type_ensure(TeleportOverlay.$gtype)
