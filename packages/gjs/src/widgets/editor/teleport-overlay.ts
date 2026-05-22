import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import Pango from '@girs/pango-1.0'
import PangoCairo from '@girs/pangocairo-1.0'
import type { SampleScene, SampleTeleport } from '../../__demo__/world-sample'

const TITLE_BAR_HEIGHT = 24
const ACCENT_FALLBACK = '#3584e4'

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
    const whiteRgba = new Gdk.RGBA()
    whiteRgba.parse('#ffffff')

    const stroke = new Gsk.Stroke(2)
    stroke.set_dash([6, 4])
    stroke.set_line_cap(Gsk.LineCap.ROUND)

    for (const t of this._teleports) {
      const a = this._endpoint(byId, t.from, t.fx, t.fy)
      const b = this._endpoint(byId, t.to, t.tx, t.ty)
      if (!a || !b) continue

      const involves = this._selectedId
        ? t.from === this._selectedId || t.to === this._selectedId
        : true
      const dimmed = this._selectedId != null && !involves

      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      const off = Math.min(80, len * 0.25)
      const c1x = mx - (dy / len) * off
      const c1y = my + (dx / len) * off

      snapshot.push_opacity(dimmed ? 0.25 : 0.85)

      // Dashed bezier curve.
      const builder = new Gsk.PathBuilder()
      builder.move_to(a.x, a.y)
      builder.quad_to(c1x, c1y, b.x, b.y)
      const path = builder.to_path()
      snapshot.push_stroke(path, stroke)
      snapshot.append_color(accent, this._coverRect())
      snapshot.pop()

      // Source marker (white core, accent ring).
      this._drawDisc(snapshot, a.x, a.y, 5, accent)
      this._drawDisc(snapshot, a.x, a.y, 3.2, whiteRgba)
      // Dest marker (filled accent).
      this._drawDisc(snapshot, b.x, b.y, 4, accent)

      if (!dimmed) this._drawLabel(snapshot, c1x, c1y, t.label, accent, whiteRgba)

      snapshot.pop()
    }
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
    const ctx = this.get_pango_context()
    const layout = Pango.Layout.new(ctx)
    const attrList = Pango.AttrList.new()
    const fontDesc = ctx.get_font_description()?.copy() ?? Pango.FontDescription.new()
    fontDesc.set_size(10 * Pango.SCALE)
    fontDesc.set_weight(Pango.Weight.BOLD)
    layout.set_font_description(fontDesc)
    layout.set_text(text, -1)
    layout.set_attributes(attrList)
    const [w, h] = layout.get_pixel_size()
    const paddingX = 8
    const paddingY = 2
    const pillW = w + paddingX * 2
    const pillH = h + paddingY * 2
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
    // Suppress unused-import warning at build time.
    void PangoCairo
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

GObject.type_ensure(TeleportOverlay.$gtype)
