import type Gio from '@girs/gio-2.0'

/**
 * The `win.*` actions the window keeps driving after install: their state
 * outlives the engine (which is disposed on every scene-editor exit), so
 * `engine-state-sync.ts` re-pushes it into each freshly created engine.
 */
export interface StatefulWindowActions {
  /** `win.mode` — the active mode-rail row. */
  mode: Gio.SimpleAction
  /** `win.library-chip` — the Library's visible chip page. */
  libraryChip: Gio.SimpleAction
  /** `win.set-tool` — the active editor tool. */
  tool: Gio.SimpleAction
  /** `win.play` — runtime (playtest) mode. */
  play: Gio.SimpleAction
  /** `win.toggle-objects` — global object visibility. */
  objects: Gio.SimpleAction
  /** `win.toggle-grid` — grid lines. */
  grid: Gio.SimpleAction
  /** `win.toggle-transparency` — non-active-layer dimming. */
  transparency: Gio.SimpleAction
  /** `win.share-session` — enabled only while a project is open. */
  share: Gio.SimpleAction
  /** `win.undo` / `win.redo` — enablement follows the engine's command stack. */
  undo: Gio.SimpleAction
  redo: Gio.SimpleAction
}

/** A stateful boolean action's state, or `fallback` before it has one. */
export function booleanState(action: Gio.SimpleAction, fallback: boolean): boolean {
  return action.get_state()?.get_boolean() ?? fallback
}

/** A stateful string action's state, or `null` before it has one. */
export function stringState(action: Gio.SimpleAction): string | null {
  return action.get_state()?.get_string()[0] ?? null
}
