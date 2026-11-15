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
  private _showFit = false
  private _compact = false

  declare _osd_box: Gtk.Box

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
          'show-fit': GObject.ParamSpec.boolean(
            'show-fit',
            'Show Fit',
            'Whether the fit-to-content button is visible (atlas only)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          compact: GObject.ParamSpec.boolean(
            'compact',
            'Compact',
            'Phone layout: a single circular Fit button, no zoom steps',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'show-fit-wide': GObject.ParamSpec.boolean(
            'show-fit-wide',
            'Show Fit Wide',
            'Whether the labelled Fit button is visible',
            GObject.ParamFlags.READABLE,
            false,
          ),
          'show-fit-compact': GObject.ParamSpec.boolean(
            'show-fit-compact',
            'Show Fit Compact',
            'Whether the circular Fit button is visible',
            GObject.ParamFlags.READABLE,
            false,
          ),
        },
        InternalChildren: ['osd_box'],
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
   * Update the cursor caption. The engine already dedupes at the
   * tile-transition layer (`Engine.onPointerTileChanged`), so this
   * normally fires only once per actual tile crossing. The
   * widget-side dedupe is kept as belt-and-braces for static
   * callers (e.g. stories) that don't go through the engine
   * pipeline. The bound display widget is a `Gtk.Inscription` (not
   * `Gtk.Label`) so even repeated text changes do not queue_resize
   * the parent — see the comment in `floating-zoom.blp`.
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

  get showFit(): boolean {
    return this._showFit ?? false
  }

  set showFit(value: boolean) {
    if (this._showFit === value) return
    this._showFit = value
    this.notify('show-fit')
    this._notifyFitVariants()
  }

  get compact(): boolean {
    return this._compact ?? false
  }

  /**
   * Phone layout (REDESIGN.md § 4.2): pinch is the zoom, so the steps
   * and the percentage go away and only "Fit" is left — as a 44 px
   * circular button. The pill styling moves from the box onto that
   * button, otherwise a toolbar pill would be drawn around a single
   * round button.
   */
  set compact(value: boolean) {
    if (this._compact === value) return
    this._compact = value
    for (const cls of ['toolbar', 'osd']) {
      if (value) this._osd_box.remove_css_class(cls)
      else this._osd_box.add_css_class(cls)
    }
    this.notify('compact')
    this._notifyFitVariants()
  }

  get showFitWide(): boolean {
    return this.showFit && !this.compact
  }

  get showFitCompact(): boolean {
    return this.showFit && this.compact
  }

  private _notifyFitVariants(): void {
    this.notify('show-fit-wide')
    this.notify('show-fit-compact')
  }
}

GObject.type_ensure(FloatingZoom.$gtype)
