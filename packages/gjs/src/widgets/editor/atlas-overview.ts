import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'

import { mapOverviewRect, type OverviewRect, overviewTransform } from './atlas-overview.geometry.ts'

const ACCENT_FALLBACK = '#3584e4'
const SCENE_FILL = new Gdk.RGBA()
SCENE_FILL.parse('rgba(255,255,255,0.28)')
const VIEWPORT_BORDER_WIDTH = 1.5

/**
 * Atlas overview minimap — a scaled-down schematic of the whole world
 * drawn as filled rectangles (one per scene) plus an accent-outlined
 * rectangle marking the current scroller viewport.
 *
 * Fed by {@link AtlasCanvas} via {@link setContent} (scene rects + total
 * content size) and {@link setViewport} (the visible region). Drawn
 * entirely in `vfunc_snapshot`; sits inside an `.osd` `Adw.Bin` in
 * `atlas-view.blp` so it inherits the floating-chrome background.
 */
export class AtlasOverview extends Gtk.Widget {
  private _rects: OverviewRect[] = []
  private _contentW = 0
  private _contentH = 0
  private _viewport: OverviewRect | null = null
  private _accent: Gdk.RGBA

  static {
    GObject.registerClass({ GTypeName: 'PixelRpgAtlasOverview' }, AtlasOverview)
  }

  constructor() {
    super()
    this._accent = new Gdk.RGBA()
    this._accent.parse(ACCENT_FALLBACK)
    this.can_target = false
    this.set_hexpand(true)
    this.set_vexpand(true)
  }

  /** Scene rectangles + the total atlas content size they live in. */
  setContent(rects: OverviewRect[], contentW: number, contentH: number): void {
    this._rects = rects
    this._contentW = contentW
    this._contentH = contentH
    this.queue_draw()
  }

  /** The currently-visible region (scroller value + page size) in content coords. */
  setViewport(x: number, y: number, w: number, h: number): void {
    this._viewport = { x, y, w, h }
    this.queue_draw()
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    // Uniform fit of the whole content box into the widget, centered.
    const transform = overviewTransform(this.get_width(), this.get_height(), this._contentW, this._contentH)
    if (!transform) return
    const map = (r: OverviewRect): Graphene.Rect => {
      const mapped = mapOverviewRect(r, transform)
      const rect = new Graphene.Rect()
      rect.init(mapped.x, mapped.y, mapped.w, mapped.h)
      return rect
    }

    for (const r of this._rects) snapshot.append_color(SCENE_FILL, map(r))

    if (this._viewport) {
      const accent = this._lookupAccent()
      const vp = map(this._viewport)
      const rounded = new Gsk.RoundedRect()
      rounded.init_from_rect(vp, 1)
      const w = VIEWPORT_BORDER_WIDTH
      snapshot.append_border(rounded, [w, w, w, w], [accent, accent, accent, accent])
    }
  }

  private _lookupAccent(): Gdk.RGBA {
    try {
      const [found, color] = this.get_style_context().lookup_color('accent_bg_color')
      if (found) return color
    } catch {
      /* deprecated lookup — fall through to cached fallback */
    }
    return this._accent
  }
}

GObject.type_ensure(AtlasOverview.$gtype)
