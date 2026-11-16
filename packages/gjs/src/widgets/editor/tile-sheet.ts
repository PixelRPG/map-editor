import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'

import { type HatchSegment, type TileCollisionRef, wallHatchSegments } from '@pixelrpg/engine'

import { SignalScope } from '../../utils/signal-scope.ts'
import {
  firstIndexOfSpan,
  indicesOfSpan,
  type SheetGrid,
  type SheetRect,
  sheetScale,
  sheetSize,
  type SheetSpan,
  type SheetStampPick,
  spanBetween,
  spanOfIndex,
  spanRect,
  tileIndexAt,
} from './tile-sheet.geometry.ts'
import { appendWallHatch, wallHatchColor } from './wall-hatch-draw.ts'

const ACCENT_FALLBACK = '#3584e4'
const RING_WIDTH = 2

/**
 * A tileset drawn as the CONTIGUOUS picture it is — the forest's trees and
 * huts appear whole, instead of being cut into a wrapped grid of detached
 * swatches where a two-tile tree is two unrelated squares (REDESIGN §5.3).
 *
 * One `append_scaled_texture` lays the whole sheet down at an integer
 * factor with `NEAREST`, so there is no per-tile widget, no per-tile
 * paintable and no blur: a 32×32 tileset is one node, not 1024 of them.
 * The upscale is faithful to the source, margins and gutters included —
 * a tap in one of them arms nothing rather than the tile next to it.
 *
 * A tap picks a tile. A pointer drag marquees a rectangle and picks the
 * whole block as a stamp brush, which the pencil then lays from the
 * hovered tile. Touch drags are left to the scroller so the sheet still
 * pans on a phone — a tap there picks the one tile under the finger.
 *
 * Pure view: it renders the sheet it is given and emits what was picked.
 */
export class TileSheet extends Gtk.Widget {
  private _texture: Gdk.Texture | null = null
  private _grid: SheetGrid | null = null
  private _scale = 1
  /**
   * What the ring frames: a block, because the armed brush IS a block
   * (`TileStamp`, whose 1×1 case is a single tile). Keeping an index here
   * instead would mean a 3×2 pick showed a one-tile ring over a
   * six-tile brush.
   */
  private _selectedSpan: SheetSpan | null = null
  /** The live marquee while a pointer drag is in flight. */
  private _marquee: SheetSpan | null = null
  /** Tile the current drag started on; `null` once the sequence is void. */
  private _anchor: number | null = null
  private _touch = false
  private _drag: Gtk.GestureDrag | null = null
  private _signals = new SignalScope()
  /** Tile index → what that tile blocks, for the "Show walls" hatch. */
  private _collision: ReadonlyMap<number, TileCollisionRef> | null = null
  private _showWalls = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTileSheet',
        Properties: {
          // Bound in Blueprint to the "Show walls" toggle next to the
          // sheet, so the host never has to reach for an action group:
          // `show-walls: bind walls_toggle.active`.
          'show-walls': GObject.ParamSpec.boolean(
            'show-walls',
            'Show Walls',
            'Whether blocking shapes are hatched over the sheet',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
        Signals: {
          'tile-selected': { param_types: [GObject.TYPE_INT] },
          // A pick wider than one tile, emitted RIGHT AFTER
          // `tile-selected` carries its anchor. The pair is ordered, not
          // parallel: `tile-selected` always says which tile was picked
          // (the chip, the recent strip and a single-tile brush need
          // nothing else), and this one then widens that pick to the
          // whole block. A host that ignores it keeps today's behaviour.
          'stamp-selected': { param_types: [GObject.TYPE_JSOBJECT] },
        },
      },
      TileSheet,
    )
  }

  declare connect: GObject.SignalMethods<this, TileSheetSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, TileSheetSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, TileSheetSignals>['emit']

  constructor() {
    super({ halign: Gtk.Align.START, valign: Gtk.Align.START })
  }

  vfunc_map(): void {
    super.vfunc_map()
    const drag = this._ensureDragGesture()
    this._signals.connect(drag, 'drag-begin', (g: Gtk.GestureDrag, x: number, y: number) => this._onDragBegin(g, x, y))
    this._signals.connect(drag, 'drag-update', (_g: Gtk.GestureDrag, dx: number, dy: number) =>
      this._onDragUpdate(dx, dy),
    )
    this._signals.connect(drag, 'drag-end', (_g: Gtk.GestureDrag, dx: number, dy: number) => this._onDragEnd(dx, dy))
    // The scroller's own pan gesture claims a touch sequence once it
    // passes the drag threshold, which cancels this one — that is how a
    // flick pans instead of painting. Clearing the anchor here is what
    // keeps the cancelled sequence from still picking a tile.
    this._signals.connect(drag, 'cancel', () => this._clearDrag())
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    this._clearDrag()
    super.vfunc_unmap()
  }

  /** The sheet's tile grid, or `null` while no tileset is loaded. */
  get grid(): SheetGrid | null {
    return this._grid
  }

  /** The integer factor the sheet is drawn at. */
  get scale(): number {
    return this._scale
  }

  get showWalls(): boolean {
    return this._showWalls ?? false
  }

  set showWalls(value: boolean) {
    if (this._showWalls === value) return
    this._showWalls = value
    this.notify('show-walls')
    this.queue_draw()
  }

  /**
   * What each tile blocks, keyed by tile index — only read while
   * {@link showWalls} is on.
   *
   * Walkable tiles may be left out entirely; the host passes whatever
   * its sprite definitions say and {@link wallRectsOf} decides what is
   * actually hatched, so the two can never disagree.
   */
  setCollision(collision: ReadonlyMap<number, TileCollisionRef> | null): void {
    this._collision = collision
    if (this._showWalls) this.queue_draw()
  }

  /**
   * Show `texture` laid out on `grid`. Passing `null` for either empties
   * the sheet — the host swaps in its own "no tiles yet" state.
   */
  setSheet(texture: Gdk.Texture | null, grid: SheetGrid | null): void {
    this._texture = texture
    this._grid = grid
    this._scale = grid ? sheetScale(grid.tileWidth, grid.tileHeight) : 1
    this._selectedSpan = null
    this._clearDrag()
    this.queue_resize()
    this.queue_draw()
  }

  /** Ring the tile at `index` without emitting. Off-grid clears the ring. */
  selectTile(index: number): void {
    this.selectStamp(this._grid ? spanOfIndex(this._grid, index) : null)
  }

  /**
   * Ring a whole block without emitting — the echo path for a host that
   * armed a stamp, so the sheet shows the brush it actually holds.
   */
  selectStamp(span: SheetSpan | null): void {
    const next = span && this._grid && firstIndexOfSpan(this._grid, span) !== null ? span : null
    if (sameSpan(next, this._selectedSpan)) return
    this._selectedSpan = next
    this.queue_draw()
  }

  clearSelection(): void {
    if (this._selectedSpan === null) return
    this._selectedSpan = null
    this.queue_draw()
  }

  vfunc_measure(orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    if (!this._grid) return [0, 0, -1, -1]
    const [width, height] = sheetSize(this._grid, this._scale)
    // Minimum == natural: the sheet is never squeezed, it is panned. The
    // scroller's own `min-content-*` decides how much of it is on screen.
    const size = orientation === Gtk.Orientation.HORIZONTAL ? width : height
    return [size, size, -1, -1]
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const texture = this._texture
    const grid = this._grid
    if (!texture || !grid) return

    const [width, height] = sheetSize(grid, this._scale)
    const dest = new Graphene.Rect()
    dest.init(0, 0, width, height)
    snapshot.append_scaled_texture(texture, Gsk.ScalingFilter.NEAREST, dest)

    // Over the artwork, under the selection ring: the hatch is about the
    // tiles, the ring is about the tool.
    this._snapshotWalls(snapshot, grid)

    const accent = this._accentColor()
    // The marquee wins while a drag is in flight: it is what the release
    // will act on, and showing the old ring next to it would read as two
    // selections.
    const span = this._marquee ?? this._selectedSpan
    const ring = spanRect(grid, this._scale, span)
    if (ring) this._drawRing(snapshot, ring, accent)
  }

  /**
   * Hatch every blocking tile in ONE pass over the whole sheet.
   *
   * The segments of all tiles go into a single stroke, which is both
   * cheap and the reason the hatch reads as continuous: the geometry is
   * phased on this widget's origin, so two blocked neighbours line up
   * instead of meeting at a seam.
   */
  private _snapshotWalls(snapshot: Gtk.Snapshot, grid: SheetGrid): void {
    const collision = this._collision
    if (!this._showWalls || !collision || collision.size === 0) return

    const segments: HatchSegment[] = []
    for (const [index, ref] of collision) {
      const cell = spanRect(grid, this._scale, spanOfIndex(grid, index))
      if (!cell) continue
      segments.push(...wallHatchSegments(ref, grid.tileWidth, grid.tileHeight, cell))
    }
    appendWallHatch(snapshot, segments, wallHatchColor(this))
  }

  private _drawRing(snapshot: Gtk.Snapshot, rect: SheetRect, color: Gdk.RGBA): void {
    const frame = new Graphene.Rect()
    frame.init(rect.x, rect.y, rect.width, rect.height)
    const rounded = new Gsk.RoundedRect()
    rounded.init_from_rect(frame, 1)
    const w = RING_WIDTH
    snapshot.append_border(rounded, [w, w, w, w], [color, color, color, color])
  }

  private _accentColor(): Gdk.RGBA {
    try {
      const [found, color] = this.get_style_context().lookup_color('accent_bg_color')
      if (found) return color
    } catch {
      // GTK4 deprecation may turn lookup_color into a no-op; fall back.
    }
    const rgba = new Gdk.RGBA()
    rgba.parse(ACCENT_FALLBACK)
    return rgba
  }

  /**
   * Created once and kept; `vfunc_unmap` releases its handlers, not the
   * controller (the pattern of {@link AtlasCanvas}).
   */
  private _ensureDragGesture(): Gtk.GestureDrag {
    if (this._drag) return this._drag
    const drag = new Gtk.GestureDrag()
    this.add_controller(drag)
    this._drag = drag
    return drag
  }

  private _onDragBegin(gesture: Gtk.GestureDrag, x: number, y: number): void {
    this._touch = gesture.get_current_event_device()?.get_source() === Gdk.InputSource.TOUCHSCREEN
    this._anchor = this._grid ? tileIndexAt(this._grid, this._scale, x, y) : null
    this._marquee = null
  }

  private _onDragUpdate(dx: number, dy: number): void {
    // No marquee under a finger: the same movement has to stay available
    // for panning, and a one-finger rectangle on a phone has no way to
    // say "I meant to select, not to scroll".
    if (this._touch || this._anchor === null || !this._grid) return
    const next = this._spanTo(this._anchor, dx, dy)
    if (sameSpan(next, this._marquee)) return
    this._marquee = next
    this.queue_draw()
  }

  private _onDragEnd(dx: number, dy: number): void {
    const grid = this._grid
    const anchor = this._anchor
    const touch = this._touch
    this._clearDrag()
    if (!grid || anchor === null) return
    // A touch release never travelled (a travelling one was claimed by
    // the scroller and cancelled this gesture), so it is a tap on the
    // anchor; a pointer release picks the whole block it marqueed.
    const span = touch ? spanOfIndex(grid, anchor) : (this._spanTo(anchor, dx, dy) ?? spanOfIndex(grid, anchor))
    const index = firstIndexOfSpan(grid, span)
    if (index === null || !span) return
    this.selectStamp(span)
    this.emit('tile-selected', index)
    // Only a real block needs the second signal: a 1×1 pick is already
    // fully described by its anchor, and a host that re-armed it as a
    // stamp would write the same brush twice.
    if (span.columns > 1 || span.rows > 1) {
      this.emit('stamp-selected', { span, indices: indicesOfSpan(grid, span) } satisfies SheetStampPick)
    }
  }

  /**
   * The block from `anchor` to the drag's current offset, if both are on
   * tiles.
   *
   * The anchor is a PARAMETER, not `this._anchor`: reading it from the
   * field made the measurement silently depend on whether `_clearDrag`
   * had already run, and a release that measured afterwards always
   * collapsed to a single cell.
   */
  private _spanTo(anchor: number, dx: number, dy: number): SheetSpan | null {
    const grid = this._grid
    if (!grid) return null
    const start = spanOfIndex(grid, anchor)
    if (!start) return null
    const origin = spanRect(grid, this._scale, start)
    if (!origin) return null
    // Measure from the anchor tile's centre so the drag's own start
    // position inside that tile cannot shift the rectangle by one cell.
    const to = tileIndexAt(grid, this._scale, origin.x + origin.width / 2 + dx, origin.y + origin.height / 2 + dy)
    return to === null ? start : spanBetween(grid, anchor, to)
  }

  private _clearDrag(): void {
    this._anchor = null
    this._touch = false
    if (!this._marquee) return
    this._marquee = null
    this.queue_draw()
  }
}

/**
 * Typed view of the signals {@link TileSheet} registers, layered on the
 * parent's own so inherited signals keep their argument lists.
 */
export interface TileSheetSignals extends Gtk.Widget.SignalSignatures {
  'tile-selected': (tileId: number) => void
  'stamp-selected': (pick: SheetStampPick) => void
}

function sameSpan(a: SheetSpan | null, b: SheetSpan | null): boolean {
  if (!a || !b) return a === b
  return a.col === b.col && a.row === b.row && a.columns === b.columns && a.rows === b.rows
}

GObject.type_ensure(TileSheet.$gtype)
