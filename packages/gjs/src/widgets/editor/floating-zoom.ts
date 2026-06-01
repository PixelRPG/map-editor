import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'

import Template from './floating-zoom.blp'

/**
 * OSD zoom pill — `−` / current-zoom / `+`, plus an optional cursor
 * coordinate caption.
 *
 * The buttons fire window actions (`win.zoom-out|in|reset`) — the parent
 * keeps the source of truth for `zoom` and `cursor`. The widget displays
 * whatever is pushed in via {@link FloatingZoom.setZoom} /
 * {@link FloatingZoom.setCursor}.
 */
export class FloatingZoom extends Adw.Bin {
  private _zoom = 1
  private _cursorX: number | null = null
  private _cursorY: number | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgFloatingZoom',
        Template,
        Properties: {
          'zoom-label': GObject.ParamSpec.string(
            'zoom-label',
            'Zoom Label',
            'Formatted zoom percentage',
            GObject.ParamFlags.READABLE,
            '100%',
          ),
          'cursor-label': GObject.ParamSpec.string(
            'cursor-label',
            'Cursor Label',
            'Formatted cursor coordinate',
            GObject.ParamFlags.READABLE,
            '',
          ),
          'show-cursor': GObject.ParamSpec.boolean(
            'show-cursor',
            'Show Cursor',
            'Whether the cursor caption is visible',
            GObject.ParamFlags.READABLE,
            false,
          ),
        },
      },
      FloatingZoom,
    )
  }

  setZoom(zoom: number): void {
    if (this._zoom === zoom) return
    this._zoom = zoom
    this.notify('zoom-label')
  }

  /**
   * Update the cursor caption. Dedupe-heavy by design: this is the
   * hot path during pointer hover (the maker pipes pointermove → here
   * at engine framerate). Without dedupe, every move queues a GTK
   * relayout + snapshot pass, which races against the overlay's own
   * continuous engine-canvas redraws and surfaces as
   *
   *   GtkWidget snapshot called without a current allocation
   *
   * bursts. Skipping unchanged coords + only emitting `show-cursor`
   * when the boolean actually flips drops the notify pressure to
   * "first move + visibility transitions only".
   */
  setCursor(x: number | null, y: number | null): void {
    if (this._cursorX === x && this._cursorY === y) return
    const wasVisible = this._cursorX != null && this._cursorY != null
    this._cursorX = x
    this._cursorY = y
    this.notify('cursor-label')
    const nowVisible = x != null && y != null
    if (nowVisible !== wasVisible) this.notify('show-cursor')
  }

  get zoomLabel(): string {
    return `${Math.round((this._zoom ?? 1) * 100)}%`
  }

  get cursorLabel(): string {
    const x = this._cursorX
    const y = this._cursorY
    if (x == null || y == null) return ''
    return `${x}, ${y}`
  }

  get showCursor(): boolean {
    return this._cursorX != null && this._cursorY != null
  }

  /**
   * Defensive snapshot guard.
   *
   * GTK4 emits `Trying to snapshot <widget> without a current
   * allocation` when the compositor's snapshot pass reaches a
   * widget whose `allocated_{width,height}` are both 0. For the
   * FloatingZoom that happens in bursts coincident with engine-
   * canvas redraws (60 FPS): the overlay walks its children for
   * snapshot on every GLArea render tick, and for reasons that
   * don't reproduce in isolation (suspected interaction between
   * Gtk.WindowHandle's internal allocation state and the
   * overlay's snapshot iterator) FloatingZoom is sometimes
   * walked between its size-allocate and its first draw.
   *
   * Short-circuiting on zero allocation is semantically correct
   * — a zero-sized widget renders nothing visible anyway — and
   * silences the warning spam without affecting the widget's
   * normal lifecycle. The next valid snapshot pass (after the
   * next size-allocate) draws the widget as usual.
   */
  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    if (this.get_allocated_width() === 0 && this.get_allocated_height() === 0) return
    super.vfunc_snapshot(snapshot)
  }
}

GObject.type_ensure(FloatingZoom.$gtype)
