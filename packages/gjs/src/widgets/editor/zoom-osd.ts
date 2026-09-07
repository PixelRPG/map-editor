import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

/** How long the readout stays up after the last zoom change. */
export const ZOOM_OSD_LINGER_MS = 1200

/**
 * The zoom readout, as feedback rather than furniture.
 *
 * The zoom pill it replaces cost 10 324 px² of the canvas's bottom-left
 * corner at every window size, permanently, for three buttons that are
 * consulted between tasks and a number that only matters at the moment
 * it changes. This shows the number at the bottom centre for
 * {@link ZOOM_OSD_LINGER_MS} after a change and then fades out, so the
 * standing cost is zero. The `+`/`-`/`0` accelerators, the wheel, pinch
 * and three "⋯" items drive the zoom itself.
 *
 * `Gtk.Inscription`, not `Gtk.Label`: a Label re-measures when the text
 * changes ("98 %" → "220 %"), the `queue_resize` bubbles up through
 * every ancestor and briefly zeroes their allocations, which flickers
 * the whole OSD. Inscription's measure is fixed at `nat-chars`.
 */
export class ZoomOsd extends Gtk.Revealer {
  private _label: Gtk.Inscription
  private _timeout = 0
  private _zoom = 1

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgZoomOsd',
      },
      ZoomOsd,
    )
  }

  constructor() {
    super({
      transition_type: Gtk.RevealerTransitionType.CROSSFADE,
      transition_duration: 150,
      reveal_child: false,
      halign: Gtk.Align.CENTER,
      valign: Gtk.Align.END,
      // The revealer is the overlay child, so it must not swallow the
      // canvas underneath it while it is hidden.
      can_target: false,
    })
    this._label = new Gtk.Inscription({
      min_chars: 5,
      nat_chars: 5,
      xalign: 0.5,
      valign: Gtk.Align.CENTER,
    })
    this._label.add_css_class('numeric')
    const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL })
    box.add_css_class('toolbar')
    box.add_css_class('osd')
    box.add_css_class('zoom-osd')
    box.append(this._label)
    this.set_child(box)
  }

  /** Show `zoom` as a percentage and re-arm the fade-out. */
  setZoom(zoom: number): void {
    this._zoom = zoom
    this._label.set_text(`${Math.round(zoom * 100)}%`)
    this.set_reveal_child(true)
    this._arm()
  }

  /** The percentage currently on screen, for tests and stories. */
  get zoomLabel(): string {
    return `${Math.round((this._zoom ?? 1) * 100)}%`
  }

  private _arm(): void {
    this._disarm()
    this._timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ZOOM_OSD_LINGER_MS, () => {
      this._timeout = 0
      this.set_reveal_child(false)
      return GLib.SOURCE_REMOVE
    })
  }

  private _disarm(): void {
    if (!this._timeout) return
    GLib.source_remove(this._timeout)
    this._timeout = 0
  }

  vfunc_unmap(): void {
    // A timer that outlives the widget would fire into a disposed
    // instance; `unmap` is where this package stops timers.
    this._disarm()
    this.set_reveal_child(false)
    super.vfunc_unmap()
  }
}

GObject.type_ensure(ZoomOsd.$gtype)
