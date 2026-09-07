import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

/** What the layout needs from the strip it lays out — `RecentTiles` implements it. */
export interface RecentTilesHost extends Gtk.Widget {
  /** The strip's minimum: one swatch, so the bar never asks the window for more than that. */
  firstTileMinPx(): number
  /** Width the row cannot use for swatches: the gap and the "⌃" button. */
  reservedPx(): number
  /** Show the first swatches that fit `rowPx` whole, hide the rest. */
  fitTiles(rowPx: number): void
}

/**
 * The layout manager of `PixelRpgRecentTiles`. It does two things a
 * `Gtk.BinLayout` cannot:
 *
 * - it reports ONE swatch as the horizontal minimum — the strip must
 *   never be what stops a window from reaching the phone width; and
 * - at allocation it asks the host to show only the swatches that fit
 *   whole, before handing the child its full allocation.
 *
 * It lives on the `Adw.Bin`, not on the row `Gtk.Box`: `AdwBin` never
 * looks at its layout manager's type, while `GtkBox` casts its own to
 * `GtkBoxLayout` in every spacing / orientation property access — a
 * devtools `GetProperty("spacing")` on a re-managed box is a critical.
 * Hiding via `set_child_visible` is what `Gtk.Stack` does from its own
 * allocation: it maps and unmaps, and queues no resize.
 */
export class RecentTilesLayout extends Gtk.LayoutManager {
  static {
    GObject.registerClass({ GTypeName: 'PixelRpgRecentTilesLayout' }, RecentTilesLayout)
  }

  vfunc_get_request_mode(_widget: Gtk.Widget): Gtk.SizeRequestMode {
    return Gtk.SizeRequestMode.CONSTANT_SIZE
  }

  vfunc_measure(widget: Gtk.Widget, orientation: Gtk.Orientation, forSize: number): [number, number, number, number] {
    const child = widget.get_first_child()
    if (!child) return [0, 0, -1, -1]
    const [min, nat] = child.measure(orientation, forSize)
    if (orientation === Gtk.Orientation.VERTICAL) return [min, nat, -1, -1]
    const host = widget as RecentTilesHost
    return [Math.min(min, host.firstTileMinPx() + host.reservedPx()), nat, -1, -1]
  }

  vfunc_allocate(widget: Gtk.Widget, width: number, height: number, baseline: number): void {
    const child = widget.get_first_child()
    if (!child) return
    const host = widget as RecentTilesHost
    host.fitTiles(width - host.reservedPx())
    child.allocate(width, height, baseline, null)
  }
}

GObject.type_ensure(RecentTilesLayout.$gtype)
