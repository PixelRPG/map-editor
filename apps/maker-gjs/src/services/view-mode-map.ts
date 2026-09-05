import type { EditorMode } from '@pixelrpg/gjs'

/** The window `Adw.ViewStack`'s page names (see `application-window.blp`). */
export type ViewName = 'welcome' | 'atlas' | 'cast' | 'objects' | 'tiles' | 'scene-editor' | 'data'

/**
 * Which mode-rail row a view belongs to. `welcome` has no mode: leaving
 * the rail where it was keeps the previous highlight for the
 * welcome → back-to-atlas return trip.
 */
const MODE_FOR_VIEW: Readonly<Record<ViewName, EditorMode | null>> = {
  welcome: null,
  atlas: 'world',
  cast: 'cast',
  objects: 'objects',
  tiles: 'tiles',
  'scene-editor': 'world',
  data: 'data',
}

/** The mode-rail row `view` belongs to, or `null` when it has none. */
export function modeForView(view: ViewName): EditorMode | null {
  return MODE_FOR_VIEW[view]
}

/**
 * The view every mode opens. Deliberately EXHAUSTIVE over `EditorMode`
 * (not `Partial`): a mode added to the union without a view here fails
 * `tsc`, and `check-mode-routes.mjs` extends that to the half tsc cannot
 * see — that the view name is a real `Adw.ViewStackPage` and that the
 * mode has a rail row.
 */
const VIEW_FOR_MODE: Readonly<Record<EditorMode, ViewName>> = {
  world: 'atlas',
  cast: 'cast',
  objects: 'objects',
  tiles: 'tiles',
  data: 'data',
}

/** Whether an arbitrary `win.mode` target string names a real mode. */
function isEditorMode(mode: string): mode is EditorMode {
  return Object.hasOwn(VIEW_FOR_MODE, mode)
}

/** Outcome of a `win.mode` change-state, resolved without touching GTK. */
export type ModeNavigation =
  | { readonly kind: 'navigate'; readonly view: ViewName }
  /** Nothing to do: no project open, or an unknown mode id. */
  | { readonly kind: 'ignore' }

/**
 * Resolve a mode-rail selection to a navigation.
 *
 * Every project-scoped mode is inert without a loaded project: from the
 * welcome view the user has to open a project first, so clicking the rail
 * must not bounce them out of whatever they are looking at.
 *
 * Every {@link EditorMode} has a view — `check-mode-routes.mjs` enforces
 * it — so there is no "picked a mode with nothing behind it" outcome. A
 * new mode ships with its `Adw.ViewStackPage`, not with a toast.
 */
export function resolveModeNavigation(mode: string, hasProject: boolean): ModeNavigation {
  if (!isEditorMode(mode) || !hasProject) return { kind: 'ignore' }
  return { kind: 'navigate', view: VIEW_FOR_MODE[mode] }
}
