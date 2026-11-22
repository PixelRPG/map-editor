/**
 * The text box as a state machine: open → reveal → complete → next page →
 * close. Pure functions over {@link DialogueData}, so the whole flow is
 * specified without a scene, a canvas or a clock.
 */

/** The fields of `DialogueStateComponent` the machine reads and writes. */
export interface DialogueData {
  readonly pages: readonly (readonly string[])[]
  page: number
  revealed: number
  confirmWasHeld: boolean
  tapQueued: boolean
}

/** What one confirm did. */
export type ConfirmResult = 'completed' | 'advanced' | 'closed'

/** Characters per second of the typewriter. Slow enough to follow, fast enough not to nag. */
export const REVEAL_CHARS_PER_SECOND = 40

/** Characters (code points) of one page; line breaks are not shown, so they do not count. */
export function pageChars(lines: readonly string[]): number {
  let count = 0
  for (const line of lines) count += Array.from(line).length
  return count
}

/** Whole characters of the current page that are visible. */
export function visibleChars(data: DialogueData): number {
  return Math.min(Math.floor(data.revealed), pageChars(data.pages[data.page] ?? []))
}

export function isPageRevealed(data: DialogueData): boolean {
  return visibleChars(data) >= pageChars(data.pages[data.page] ?? [])
}

/** Let the typewriter run for `elapsedMs`; `instant` (reduced motion) shows the page at once. */
export function advanceReveal(data: DialogueData, elapsedMs: number, instant: boolean): void {
  const total = pageChars(data.pages[data.page] ?? [])
  if (instant) data.revealed = total
  else data.revealed = Math.min(total, data.revealed + (elapsedMs * REVEAL_CHARS_PER_SECOND) / 1000)
}

/**
 * One confirm. The first finishes the page's reveal, the next moves to
 * the following page, and the one after the last page closes the box.
 */
export function confirmDialogue(data: DialogueData): ConfirmResult {
  if (!isPageRevealed(data)) {
    data.revealed = pageChars(data.pages[data.page] ?? [])
    return 'completed'
  }
  if (data.page + 1 < data.pages.length) {
    data.page += 1
    data.revealed = 0
    return 'advanced'
  }
  return 'closed'
}

/**
 * Did the player press confirm this tick? A held key or button counts
 * once, on its rising edge; a queued pointer tap counts once and is
 * consumed. Both Enter/Space/controller (`held`) and the tap reach the
 * same machine.
 */
export function takeConfirm(data: DialogueData, held: boolean): boolean {
  const pressed = (held && !data.confirmWasHeld) || data.tapQueued
  data.confirmWasHeld = held
  data.tapQueued = false
  return pressed
}
