// Pure decision rules behind the scene card's pointer handling: when a
// press becomes a drag, what that drag means, and when two clicks count
// as one activation. GTK-free so it can be unit-tested (the card
// subclasses `Gtk.Button`).

/** Pointer movement (px) a press must exceed before it counts as a drag. */
export const DRAG_THRESHOLD_PX = 4

/** Window (ms) within which a second click activates (opens) the scene. */
export const DOUBLE_CLICK_MS = 350

/** Whether a press that has travelled `(dx, dy)` has become a drag. */
export function hasPassedDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > DRAG_THRESHOLD_PX
}

/**
 * Whether a click at `now` completes a double-click started at
 * `lastClickMs`. `GtkButton` has no native double-click signal, so the
 * card debounces `clicked` itself.
 */
export function isDoubleClick(now: number, lastClickMs: number): boolean {
  return now - lastClickMs < DOUBLE_CLICK_MS
}
