import type Gtk from '@girs/gtk-4.0'

/**
 * Move `widget` so its parent becomes `target`, a no-op if it's already
 * there. Used for responsive layouts that relocate one widget between
 * two slots on a breakpoint change (e.g. an inspector that's a desktop
 * sidebar vs. a phone bottom-sheet, or a preview shown beside vs. above
 * its controls). `target` must be a `Gtk.Box` (uses `append`); the old
 * parent is detached via its own `remove`.
 */
export function reparentWidget(widget: Gtk.Widget, target: Gtk.Box): void {
  const current = widget.get_parent()
  if (current === target) return
  if (current) (current as Gtk.Box).remove(widget)
  target.append(widget)
}
