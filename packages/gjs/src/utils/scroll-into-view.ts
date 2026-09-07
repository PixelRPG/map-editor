import GLib from '@girs/glib-2.0'
import Gtk from '@girs/gtk-4.0'

/** How many idles to wait for a widget that is mapped but not laid out yet. */
const LAYOUT_ATTEMPTS = 8

/**
 * Scroll a widget into the enclosing `Gtk.Viewport`, centred — for a
 * selection made by code (a deep link, a remote edit) rather than by a
 * click, where the selected row or card may sit below the fold.
 *
 * Takes a RESOLVER, not the widget: the scroll runs on an idle so the
 * target's allocation is valid even when its page was switched in just
 * now, and by then the caller's widget may be gone — a deep link into
 * the Library re-hydrates its galleries, which rebuilds every card, so
 * the card captured at call time is an orphan when the idle runs. The
 * resolver looks the current widget up instead. A target that is mapped
 * but not laid out yet is retried on a later idle, a bounded number of
 * times; one that cannot be resolved, or has no viewport ancestor, is
 * left alone.
 *
 * The vadjustment is positioned by hand from the widget's bounds:
 * `Gtk.Viewport.scroll_to` proved unreliable through the ViewStack
 * nesting these views live in.
 */
export function scrollIntoView(resolve: () => Gtk.Widget | null): void {
  let attemptsLeft = LAYOUT_ATTEMPTS
  GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
    const widget = resolve()
    if (!widget) return GLib.SOURCE_REMOVE
    if (!widget.get_mapped() || widget.get_height() === 0) {
      attemptsLeft -= 1
      return attemptsLeft > 0 ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE
    }
    const viewport = widget.get_ancestor(Gtk.Viewport.$gtype) as Gtk.Viewport | null
    const content = viewport?.get_child()
    if (!viewport || !content) return GLib.SOURCE_REMOVE
    const [ok, bounds] = widget.compute_bounds(content)
    if (!ok) return GLib.SOURCE_REMOVE
    const adj = viewport.vadjustment
    if (!adj) return GLib.SOURCE_REMOVE
    const target = bounds.get_y() - (adj.get_page_size() - bounds.get_height()) / 2
    adj.set_value(Math.max(adj.get_lower(), Math.min(target, adj.get_upper() - adj.get_page_size())))
    return GLib.SOURCE_REMOVE
  })
}
