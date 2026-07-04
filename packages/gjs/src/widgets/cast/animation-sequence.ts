// Pure array reducers for the animation editor's frame sequence — the
// index math behind drag-insert + drag-reorder at a caret. GTK-free so it
// can be unit-tested (the dialog that uses them subclasses `Adw.Dialog`).
//
// The editor renders a caret in each GAP around the chips: gap `i` sits
// before frame `i` (gap 0 = before the first, gap `length` = after the
// last), so a drop at gap `i` means "land here at index `i`".

/** Insert `item` at gap `index` (clamped to `[0, length]`); returns a new array. */
export function insertAt<T>(items: readonly T[], index: number, item: T): T[] {
  const i = Math.max(0, Math.min(index, items.length))
  const next = items.slice()
  next.splice(i, 0, item)
  return next
}

/**
 * Move the item at `from` to gap `to`, where `to` counts gaps in the
 * ORIGINAL array (0 = before first … length = after last). Removing the
 * item first shifts any gap beyond it left by one, which this accounts for,
 * so dropping a frame into the gap on either side of itself is a no-op.
 * Returns a new array (a copy even when nothing moves).
 */
export function moveTo<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice()
  if (from < 0 || from >= items.length) return next
  const clampedTo = Math.max(0, Math.min(to, items.length))
  const [moved] = next.splice(from, 1)
  const insertAtIndex = clampedTo > from ? clampedTo - 1 : clampedTo
  next.splice(insertAtIndex, 0, moved)
  return next
}

/** Remove the item at `index`; returns a new array (a copy for an out-of-range index). */
export function removeAt<T>(items: readonly T[], index: number): T[] {
  const next = items.slice()
  if (index < 0 || index >= items.length) return next
  next.splice(index, 1)
  return next
}
