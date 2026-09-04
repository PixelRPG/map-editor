// Pure decision rules behind the scene card's pointer handling: when a
// press becomes a drag, what that drag means, and when two clicks count
// as one activation. GTK-free so it can be unit-tested (the card
// subclasses `Gtk.Button`).

/** Pointer movement (px) a press must exceed before it counts as a drag. */
export const DRAG_THRESHOLD_PX = 4

/** Window (ms) within which a second click activates (opens) the scene. */
export const DOUBLE_CLICK_MS = 350

/**
 * What a drag on the card does: `move` repositions the card on the
 * atlas, `pan` scrolls the map section inside its preview.
 */
export type SceneDragMode = 'move' | 'pan'

/**
 * Decide the drag interpretation at press time. Lock-button presses
 * always MOVE the card (a click toggles instead); presses on the preview
 * content PAN the section only while the lock is open.
 */
export function dragModeFor(pannablePreview: boolean, pressOnLock: boolean): SceneDragMode {
  return !pannablePreview || pressOnLock ? 'move' : 'pan'
}

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
