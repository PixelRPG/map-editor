import GLib from '@girs/glib-2.0'
import type Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'

import { SignalScope } from './signal-scope.ts'

/** How many idles to wait for a widget that is mapped but not laid out yet. */
const LAYOUT_ATTEMPTS = 8
/** How often the wait may restart on a `map` — once is enough for present-after-setup. */
const MAP_WAITS = 1

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
  whenLaidOut(resolve, (widget, viewport, bounds) => {
    centreOn(viewport.vadjustment, bounds.get_y(), widget.get_height())
  })
}

/** A rectangle in a widget's own coordinates — `SheetRect` fits, without the layering. */
export interface InnerRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * Scroll a RECTANGLE INSIDE a widget into the enclosing viewport, centred
 * on both axes — for a drawn surface where the interesting part is not a
 * child widget and so cannot be handed to {@link scrollIntoView}: one
 * block of a tile sheet, picked by code rather than by a tap.
 *
 * Both axes, unlike {@link scrollIntoView}: a sheet is panned sideways as
 * much as down, and a block 14 rows below the fold is as unreachable as
 * one 30 columns to the right. The resolver returns the rect with the
 * widget because it is only knowable once the widget has a scale, which
 * is once it is laid out — the same idle this waits for anyway.
 */
export function scrollRectIntoView(resolve: () => { widget: Gtk.Widget; rect: InnerRect } | null): void {
  let found: { widget: Gtk.Widget; rect: InnerRect } | null = null
  whenLaidOut(
    () => {
      found = resolve()
      return found?.widget ?? null
    },
    (_widget, viewport, bounds) => {
      if (!found) return
      centreOn(viewport.hadjustment, bounds.get_x() + found.rect.x, found.rect.width)
      centreOn(viewport.vadjustment, bounds.get_y() + found.rect.y, found.rect.height)
    },
  )
}

/** Put `[offset, size]` in the middle of `adj`'s page, clamped to its range. */
function centreOn(adj: Gtk.Adjustment | null, offset: number, size: number): void {
  if (!adj) return
  const target = offset - (adj.get_page_size() - size) / 2
  adj.set_value(Math.max(adj.get_lower(), Math.min(target, adj.get_upper() - adj.get_page_size())))
}

/**
 * Run `act` on an idle, once the resolved widget is mapped, laid out and
 * inside a viewport — retrying a bounded number of times for one that was
 * switched in just now, and giving up silently on one that never arrives.
 */
function whenLaidOut(
  resolve: () => Gtk.Widget | null,
  act: (widget: Gtk.Widget, viewport: Gtk.Viewport, bounds: Graphene.Rect) => void,
  mapWaitsLeft = MAP_WAITS,
): void {
  let attemptsLeft = LAYOUT_ATTEMPTS
  GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
    const widget = resolve()
    if (!widget) return GLib.SOURCE_REMOVE
    // Not mapped is not "not ready yet": a dialog whose page was set up
    // BEFORE it was presented stays unmapped for as long as the caller
    // takes to present it, which is longer than any number of idles.
    // Wait for the signal that actually answers, then start over.
    if (!widget.get_mapped()) {
      if (mapWaitsLeft > 0) onceMapped(widget, () => whenLaidOut(resolve, act, mapWaitsLeft - 1))
      return GLib.SOURCE_REMOVE
    }
    const viewport = widget.get_ancestor(Gtk.Viewport.$gtype) as Gtk.Viewport | null
    const content = viewport?.get_child()
    if (!viewport || !content) return GLib.SOURCE_REMOVE
    // The viewport's own allocation is what the adjustments are derived
    // from, so a viewport with no height yet would scroll against a page
    // size of 1 and land nowhere.
    if (widget.get_height() === 0 || viewport.get_height() === 0) {
      attemptsLeft -= 1
      return attemptsLeft > 0 ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE
    }
    const [ok, bounds] = widget.compute_bounds(content)
    if (!ok) return GLib.SOURCE_REMOVE
    act(widget, viewport, bounds)
    return GLib.SOURCE_REMOVE
  })
}

/**
 * Run `act` the next time `widget` is mapped, once.
 *
 * Through a {@link SignalScope} rather than a hand-rolled self-disconnect:
 * the scope owns the binding, so there is one release path for both the
 * signal that arrives and the one that never does. `disconnectAll()`
 * runs BEFORE `act`, so the one-shot is already released whatever `act`
 * goes on to do — including arming another wait on the same widget.
 */
function onceMapped(widget: Gtk.Widget, act: () => void): void {
  const scope = new SignalScope()
  scope.connect(widget, 'map', () => {
    scope.disconnectAll()
    act()
  })
}
