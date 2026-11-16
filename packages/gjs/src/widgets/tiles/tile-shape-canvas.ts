import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'

import {
  type ColliderShape,
  circleBetween,
  closesPolygon,
  isPixelBlocked,
  polygonOf,
  rectangleBetween,
  removeShapeAt,
  type ShapePoint,
  snapToTile,
  type TilePixelSize,
} from '@pixelrpg/engine'

import type { GdkSprite } from '../../sprite/index.ts'
import { SignalScope } from '../../utils/signal-scope.ts'
import { appendPixelGrid, appendPixelProbe, appendShapePath, shapeColor, shapePath } from './tile-shape-draw.ts'

/** The three ways a shape can be drawn, in the order the tool group shows them. */
export type ShapeTool = 'rectangle' | 'polygon' | 'circle'

export interface TileShapeCanvasSignals extends Gtk.Widget.SignalSignatures {
  /** The draft list changed — a shape was drawn, or the polygon in progress advanced. */
  'shapes-changed': () => void
}

/** Zoom bounds for the pinch gesture, as a multiple of the source pixel. */
const MIN_ZOOM = 4
const MAX_ZOOM = 48

/** The widget's target edge in pixels; the default zoom is derived from it. */
const PREFERRED_EDGE = 320

/**
 * The magnified tile a collider shape is drawn on (REDESIGN § 6.4,
 * Full view).
 *
 * The tile itself is the preview: the artwork is upscaled with NEAREST
 * so every source pixel is a large target, the shapes are drawn over it
 * in `--error-color`, and what the author sees blocked IS what the
 * engine meshes — the same `colliders` array, in the same tile-local
 * pixels.
 *
 * Pure view plus a draft: it owns the in-flight shape list and reports
 * every change, but never persists anything. The dialog decides whether
 * a draft is saved, and the store decides how.
 */
export class TileShapeCanvas extends Gtk.Widget {
  private _sprite: GdkSprite | null = null
  private _tileSize: TilePixelSize = { width: 16, height: 16 }
  private _shapes: ColliderShape[] = []
  private _tool: ShapeTool = 'rectangle'
  private _zoom = 16
  /** Pointer drag in flight, for the rectangle and circle tools. */
  private _dragFrom: ShapePoint | null = null
  private _dragTo: ShapePoint | null = null
  /** Corners placed so far by the polygon tool. */
  private _polygon: ShapePoint[] = []
  /** Last pointer position, drawn as the polygon's next edge. */
  private _pointer: ShapePoint | null = null
  /** Zoom at the start of a pinch, so the scale factor is absolute. */
  private _pinchBase = 16
  private _drag: Gtk.GestureDrag | null = null
  private _click: Gtk.GestureClick | null = null
  private _pinch: Gtk.GestureZoom | null = null
  private _motion: Gtk.EventControllerMotion | null = null
  private _signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTileShapeCanvas',
        Signals: {
          'shapes-changed': {},
        },
      },
      TileShapeCanvas,
    )
  }

  declare connect: GObject.SignalMethods<this, TileShapeCanvasSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, TileShapeCanvasSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, TileShapeCanvasSignals>['emit']

  constructor() {
    super({ halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER })
  }

  /** The draft, in the order it will be written to `definition.colliders`. */
  get shapes(): ColliderShape[] {
    return [...this._shapes]
  }

  /** Which gesture draws what. Switching tools drops the polygon in progress. */
  get tool(): ShapeTool {
    return this._tool
  }

  set tool(value: ShapeTool) {
    if (this._tool === value) return
    this._tool = value
    this._clearDraft()
  }

  /**
   * Show `sprite` as a `tileSize` grid and start from `shapes`.
   *
   * The sprite is a {@link GdkSprite} rather than a paintable because
   * magnification has to be NEAREST and per-pixel exact; a paintable
   * would hand the decision to whoever sized it.
   */
  setTile(sprite: GdkSprite | null, tileSize: TilePixelSize, shapes: readonly ColliderShape[]): void {
    this._sprite = sprite
    this._tileSize = tileSize
    this._shapes = [...shapes]
    this._zoom = this._defaultZoom()
    this._clearDraft()
    this.queue_resize()
  }

  /** Drop the shape at `index`; out-of-range indices are ignored. */
  removeShape(index: number): void {
    if (index < 0 || index >= this._shapes.length) return
    this._shapes = removeShapeAt(this._shapes, index)
    this.emit('shapes-changed')
    this.queue_draw()
  }

  /** Drop every shape — the dialog's "Clear" action. */
  clearShapes(): void {
    if (this._shapes.length === 0) return
    this._shapes = []
    this.emit('shapes-changed')
    this.queue_draw()
  }

  vfunc_map(): void {
    super.vfunc_map()
    const drag = this._ensureDrag()
    this._signals.connect(drag, 'drag-begin', (_g: Gtk.GestureDrag, x: number, y: number) => this._onDragBegin(x, y))
    this._signals.connect(drag, 'drag-update', (g: Gtk.GestureDrag, dx: number, dy: number) =>
      this._onDragUpdate(g, dx, dy),
    )
    this._signals.connect(drag, 'drag-end', (g: Gtk.GestureDrag, dx: number, dy: number) => this._onDragEnd(g, dx, dy))
    this._signals.connect(drag, 'cancel', () => this._clearDraft())

    const click = this._ensureClick()
    this._signals.connect(click, 'pressed', (_g: Gtk.GestureClick, _n: number, x: number, y: number) =>
      this._onPressed(x, y),
    )

    const pinch = this._ensurePinch()
    this._signals.connect(pinch, 'begin', () => {
      this._pinchBase = this._zoom
    })
    this._signals.connect(pinch, 'scale-changed', (_g: Gtk.GestureZoom, scale: number) =>
      this._setZoom(this._pinchBase * scale),
    )

    const motion = this._ensureMotion()
    this._signals.connect(motion, 'motion', (_c: Gtk.EventControllerMotion, x: number, y: number) =>
      this._onMotion(x, y),
    )
    this._signals.connect(motion, 'leave', () => {
      this._pointer = null
      if (this._polygon.length > 0) this.queue_draw()
    })
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    this._clearDraft()
    super.vfunc_unmap()
  }

  vfunc_measure(orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    const tiles = orientation === Gtk.Orientation.HORIZONTAL ? this._tileSize.width : this._tileSize.height
    const size = Math.max(1, Math.round(tiles * this._zoom))
    // Minimum == natural: the tile is never squeezed. The dialog's
    // scroller decides how much of it is on screen once a pinch has
    // magnified it past the dialog.
    return [size, size, -1, -1]
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const zoom = this._zoom
    const width = this._tileSize.width * zoom
    const height = this._tileSize.height * zoom
    const bounds = new Graphene.Rect()
    bounds.init(0, 0, width, height)

    this._snapshotTile(snapshot, bounds, zoom)
    appendPixelGrid(snapshot, this, zoom, this._tileSize.width, this._tileSize.height)

    const color = shapeColor(this, 1)
    for (const shape of this._shapes) this._snapshotShape(snapshot, shape, bounds, color, zoom)
    const preview = this._previewShape()
    if (preview) this._snapshotShape(snapshot, preview, bounds, color, zoom)
    this._snapshotProbe(snapshot, color, zoom)
  }

  /**
   * The hovered tile pixel, filled when a shape already covers it.
   *
   * Drawn last so it reads on top of the shapes it is answering about.
   * The pointer snaps to pixel CORNERS, so the inclusive far edge
   * (`x === width`) addresses no pixel and is skipped rather than
   * painted outside the tile.
   */
  private _snapshotProbe(snapshot: Gtk.Snapshot, color: Gdk.RGBA, zoom: number): void {
    const p = this._pointer
    if (!p || p.x >= this._tileSize.width || p.y >= this._tileSize.height) return
    appendPixelProbe(snapshot, color, zoom, p.x, p.y, isPixelBlocked(this._shapes, p.x, p.y, this._tileSize))
  }

  /**
   * The tile's own artwork, magnified.
   *
   * `append_scaled_texture` lays the WHOLE sheet down scaled and the
   * clip confines it to this tile — the idiom `GdkSpritePaintable`
   * uses, repeated here because the canvas needs the zoom under its own
   * control rather than negotiated through a paintable's size.
   */
  private _snapshotTile(snapshot: Gtk.Snapshot, bounds: Graphene.Rect, zoom: number): void {
    const texture: Gdk.Texture | null = this._sprite?.sourceTexture ?? null
    if (!texture || !this._sprite) return

    snapshot.push_clip(bounds)
    snapshot.save()
    const origin = new Graphene.Point()
    origin.x = -this._sprite.x * zoom
    origin.y = -this._sprite.y * zoom
    snapshot.translate(origin)
    const sheet = new Graphene.Rect()
    sheet.init(0, 0, texture.get_width() * zoom, texture.get_height() * zoom)
    snapshot.append_scaled_texture(texture, Gsk.ScalingFilter.NEAREST, sheet)
    snapshot.restore()
    snapshot.pop()
  }

  private _snapshotShape(
    snapshot: Gtk.Snapshot,
    shape: ColliderShape,
    bounds: Graphene.Rect,
    color: Gdk.RGBA,
    zoom: number,
  ): void {
    const path = shapePath(shape, zoom, this._tileSize.width, this._tileSize.height)
    if (path) appendShapePath(snapshot, path, bounds, color)
  }

  /**
   * The shape the gesture in flight would commit, so the author sees it
   * before releasing. The polygon in progress is previewed through the
   * pointer, which is why it is drawn even with two corners placed.
   */
  private _previewShape(): ColliderShape | null {
    if (this._tool === 'polygon') {
      if (this._polygon.length === 0) return null
      const points = this._pointer ? [...this._polygon, this._pointer] : this._polygon
      return { type: 'polygon', points }
    }
    if (!this._dragFrom || !this._dragTo) return null
    return this._tool === 'circle'
      ? circleBetween(this._dragFrom, this._dragTo)
      : rectangleBetween(this._dragFrom, this._dragTo)
  }

  private _defaultZoom(): number {
    const edge = Math.max(this._tileSize.width, this._tileSize.height, 1)
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.floor(PREFERRED_EDGE / edge)))
  }

  private _setZoom(value: number): void {
    const next = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)))
    if (next === this._zoom) return
    this._zoom = next
    this.queue_resize()
  }

  /** Widget pixels → a whole tile pixel inside the tile. */
  private _pointAt(x: number, y: number): ShapePoint {
    return snapToTile({ x: x / this._zoom, y: y / this._zoom }, this._tileSize)
  }

  private _onDragBegin(x: number, y: number): void {
    if (this._tool === 'polygon') return
    this._dragFrom = this._pointAt(x, y)
    this._dragTo = this._dragFrom
    this.queue_draw()
  }

  private _onDragUpdate(gesture: Gtk.GestureDrag, dx: number, dy: number): void {
    if (!this._dragFrom) return
    this._dragTo = this._offsetPoint(gesture, dx, dy)
    this.queue_draw()
  }

  private _onDragEnd(gesture: Gtk.GestureDrag, dx: number, dy: number): void {
    const from = this._dragFrom
    if (!from) return
    const to = this._offsetPoint(gesture, dx, dy)
    this._dragFrom = null
    this._dragTo = null
    const shape = this._tool === 'circle' ? circleBetween(from, to) : rectangleBetween(from, to)
    // A drag too small to describe a shape is a mis-click, not an
    // instruction — dropping it is what keeps an invisible collider out
    // of the list.
    if (shape) this._commit(shape)
    else this.queue_draw()
  }

  private _offsetPoint(gesture: Gtk.GestureDrag, dx: number, dy: number): ShapePoint {
    const [, startX, startY] = gesture.get_start_point()
    return this._pointAt(startX + dx, startY + dy)
  }

  /** A click places a polygon corner, or closes the outline on the first one. */
  private _onPressed(x: number, y: number): void {
    if (this._tool !== 'polygon') return
    const point = this._pointAt(x, y)
    if (closesPolygon(this._polygon, point)) {
      const shape = polygonOf(this._polygon)
      this._polygon = []
      if (shape) this._commit(shape)
      else this.queue_draw()
      return
    }
    this._polygon.push(point)
    this.queue_draw()
  }

  /**
   * The pointer drives two things, which is why it is tracked for every
   * tool rather than only while a polygon is open: the polygon preview's
   * rubber-band edge, and the hovered pixel's "hero bumps here" readout
   * (§ 6.4).
   */
  private _onMotion(x: number, y: number): void {
    const point = this._pointAt(x, y)
    if (this._pointer?.x === point.x && this._pointer?.y === point.y) return
    this._pointer = point
    this.queue_draw()
  }

  private _commit(shape: ColliderShape): void {
    this._shapes.push(shape)
    this._pointer = null
    this.emit('shapes-changed')
    this.queue_draw()
  }

  private _clearDraft(): void {
    this._dragFrom = null
    this._dragTo = null
    this._polygon = []
    this._pointer = null
    this.queue_draw()
  }

  private _ensureDrag(): Gtk.GestureDrag {
    if (!this._drag) {
      this._drag = new Gtk.GestureDrag()
      this.add_controller(this._drag)
    }
    return this._drag
  }

  private _ensureClick(): Gtk.GestureClick {
    if (!this._click) {
      this._click = new Gtk.GestureClick()
      this.add_controller(this._click)
    }
    return this._click
  }

  private _ensurePinch(): Gtk.GestureZoom {
    if (!this._pinch) {
      this._pinch = new Gtk.GestureZoom()
      this.add_controller(this._pinch)
    }
    return this._pinch
  }

  private _ensureMotion(): Gtk.EventControllerMotion {
    if (!this._motion) {
      this._motion = new Gtk.EventControllerMotion()
      this.add_controller(this._motion)
    }
    return this._motion
  }
}

GObject.type_ensure(TileShapeCanvas.$gtype)
