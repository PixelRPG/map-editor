/**
 * What one "back" undoes.
 *
 * Back is five gestures onto one decision (REDESIGN.md § 3.4): the
 * header's back button, `Esc`, `Alt+←`, the mouse back button and the
 * shell's back gesture. They must all undo the *same* thing, so the
 * choice lives here as a pure function over the shell's state instead of
 * once per gesture — a handler that decided for itself is how `Esc` and
 * the back button drift apart.
 */

/** The steps a back can take, in the precedence § 3.4 fixes. */
export const BACK_STEPS = ['stop-run', 'collapse-sheet', 'clear-selection', 'pop-page', 'leave-map', 'none'] as const

/** One thing a back undoes; `'none'` means there is nothing left to undo. */
export type BackStep = (typeof BACK_STEPS)[number]

/** The shell state a back decision reads. */
export interface BackState {
  /**
   * A Live Run is playing. Not gated on the visible destination: the run
   * owns the whole window while it lasts, so back stops it from anywhere.
   */
  running: boolean
  /** The map editor is the visible destination. */
  inMap: boolean
  /**
   * The map editor's bottom sheet is expanded. Read only while `inMap`:
   * the `Adw.ViewStack` keeps the editor page alive across switches, so
   * an open sheet on a hidden editor must not swallow World's back.
   */
  sheetOpen: boolean
  /** Something is selected in the map editor. Read only while `inMap`. */
  hasSelection: boolean
  /** The visible destination has a pushed detail page to pop. */
  pushedPage: boolean
}

/**
 * The one step this back takes. Callers perform it and report whether
 * they handled the gesture — `'none'` is the only answer that lets the
 * event travel on (to the shell's own back, or to nothing at all).
 */
export function resolveBackStep(state: BackState): BackStep {
  if (state.running) return 'stop-run'
  if (state.inMap) {
    if (state.sheetOpen) return 'collapse-sheet'
    if (state.hasSelection) return 'clear-selection'
  }
  if (state.pushedPage) return 'pop-page'
  if (state.inMap) return 'leave-map'
  return 'none'
}

/**
 * Which destinations have a drilled-in detail page covering their list
 * (collapsed split views only), for {@link pushedPageFor}.
 */
export interface PushedPages {
  library: boolean
  game: boolean
}

/**
 * Whether the visible destination has a page to pop. Only the visible
 * one counts: `Adw.ViewStack` keeps every destination alive, so a Game
 * section left open must not swallow the Library's back.
 */
export function pushedPageFor(view: string, pages: PushedPages): boolean {
  if (view === 'library') return pages.library
  if (view === 'game') return pages.game
  return false
}
