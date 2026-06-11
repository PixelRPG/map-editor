import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'

/** Translucent fill + solid outline used for the collision box. */
const COLLISION_FILL = 'rgba(230, 97, 0, 0.32)'
const COLLISION_STROKE = '#e66100'
const BORDER_PX = 2

/**
 * Zoomed, pixel-art-crisp preview of a single sprite cell with the
 * collision box drawn on top — the visual half of the sprite-set
 * import dialog's collision step. The user adjusts the box via spin
 * rows; this widget shows exactly which part of the sprite is solid.
 *
 * Renders the source sprite-sheet texture clipped + translated to the
 * selected cell (nearest-neighbour scaling, so pixels stay sharp at
 * any zoom), then overlays the collider rectangle in a warm accent so
 * it reads as "blocking". A raw `Gtk.Widget` (not `Adw.Bin`) so the
 * draw is a single self-contained `vfunc_snapshot` — mirrors
 * {@link ProjectHeroIcon} / {@link GdkSpritePaintable}.
 *
 * All geometry is in sprite-cell pixels; the widget maps it to its
 * allocation with one shared scale, centring the cell. Collider
 * coordinates are cell-local (origin = top-left of the cell).
 */
export class CollisionPreview extends Gtk.Widget {
  private _texture: Gdk.Texture | null = null
  private _cellX = 0
  private _cellY = 0
  private _cellW = 16
  private _cellH = 16
  private _colliderX = 0
  private _colliderY = 0
  private _colliderW = 16
  private _colliderH = 16
  private _showCollider = true
  /** Target on-screen size of the cell's longer edge (drives `vfunc_measure`). */
  private _displayScale = 8

  static {
    GObject.registerClass({ GTypeName: 'PixelRpgCollisionPreview' }, CollisionPreview)
  }

  constructor() {
    super()
    this.add_css_class('card')
  }

  /**
   * Point the preview at a sprite-sheet texture + which cell to show.
   * `cellX/Y` are the cell's top-left in texture pixels; `cellW/H` its
   * size. Recomputes the display scale so a tiny 16px sprite is shown
   * comfortably large.
   */
  setCell(texture: Gdk.Texture | null, cellX: number, cellY: number, cellW: number, cellH: number): void {
    this._texture = texture
    this._cellX = cellX
    this._cellY = cellY
    this._cellW = Math.max(1, cellW)
    this._cellH = Math.max(1, cellH)
    // Scale the longer edge to ~160px, snapped to an integer factor so
    // pixel art stays crisp; clamp so huge cells don't overflow.
    const longest = Math.max(this._cellW, this._cellH)
    this._displayScale = Math.max(1, Math.min(16, Math.round(160 / longest)))
    this.queue_resize()
    this.queue_draw()
  }

  /** Set the collider rectangle (cell-local pixels) + whether to draw it. */
  setCollider(x: number, y: number, w: number, h: number, show: boolean): void {
    this._colliderX = x
    this._colliderY = y
    this._colliderW = w
    this._colliderH = h
    this._showCollider = show
    this.queue_draw()
  }

  vfunc_measure(orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    const natural =
      orientation === Gtk.Orientation.HORIZONTAL ? this._cellW * this._displayScale : this._cellH * this._displayScale
    // Min stays small so the widget can shrink on narrow phones; the
    // snapshot letterboxes to the available space either way.
    const min = Math.min(natural, orientation === Gtk.Orientation.HORIZONTAL ? this._cellW * 2 : this._cellH * 2)
    return [min, natural, -1, -1]
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const width = this.get_width()
    const height = this.get_height()
    if (!this._texture || this._cellW <= 0 || this._cellH <= 0 || width <= 0 || height <= 0) return

    // One shared scale keeps the sprite's aspect ratio; centre the cell.
    const scale = Math.min(width / this._cellW, height / this._cellH)
    const renderW = this._cellW * scale
    const renderH = this._cellH * scale
    const originX = (width - renderW) / 2
    const originY = (height - renderH) / 2

    // Draw the selected cell: clip to its rect, then blit the whole
    // sheet translated so the cell lands at the origin (NEAREST = no
    // blur on pixel art).
    const clip = new Graphene.Rect()
    clip.init(originX, originY, renderW, renderH)
    snapshot.push_clip(clip)
    snapshot.save()
    const offset = new Graphene.Point()
    offset.x = originX - this._cellX * scale
    offset.y = originY - this._cellY * scale
    snapshot.translate(offset)
    const sheetRect = new Graphene.Rect()
    sheetRect.init(0, 0, this._texture.get_width() * scale, this._texture.get_height() * scale)
    snapshot.append_scaled_texture(this._texture, Gsk.ScalingFilter.NEAREST, sheetRect)
    snapshot.restore()
    snapshot.pop()

    if (!this._showCollider) return

    // Collider box, clamped to the cell so an over-sized rect can't
    // paint outside the sprite preview.
    const cx = originX + Math.max(0, this._colliderX) * scale
    const cy = originY + Math.max(0, this._colliderY) * scale
    const cw = Math.min(this._colliderW, this._cellW - Math.max(0, this._colliderX)) * scale
    const ch = Math.min(this._colliderH, this._cellH - Math.max(0, this._colliderY)) * scale
    if (cw <= 0 || ch <= 0) return

    const fill = new Gdk.RGBA()
    fill.parse(COLLISION_FILL)
    const fillRect = new Graphene.Rect()
    fillRect.init(cx, cy, cw, ch)
    snapshot.append_color(fill, fillRect)
    this._strokeRect(snapshot, cx, cy, cw, ch)
  }

  /** Draw a `BORDER_PX` outline as four thin colour rects (no Gsk border node needed). */
  private _strokeRect(snapshot: Gtk.Snapshot, x: number, y: number, w: number, h: number): void {
    const stroke = new Gdk.RGBA()
    stroke.parse(COLLISION_STROKE)
    const edge = (ex: number, ey: number, ew: number, eh: number): void => {
      const r = new Graphene.Rect()
      r.init(ex, ey, ew, eh)
      snapshot.append_color(stroke, r)
    }
    edge(x, y, w, BORDER_PX) // top
    edge(x, y + h - BORDER_PX, w, BORDER_PX) // bottom
    edge(x, y, BORDER_PX, h) // left
    edge(x + w - BORDER_PX, y, BORDER_PX, h) // right
  }
}

GObject.type_ensure(CollisionPreview.$gtype)
