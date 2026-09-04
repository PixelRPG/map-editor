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

const VIEW_FOR_MODE: Readonly<Partial<Record<EditorMode, ViewName>>> = {
  world: 'atlas',
  cast: 'cast',
  objects: 'objects',
  tiles: 'tiles',
  data: 'data',
}

/**
 * Only these three views map back onto their own rail row when a mode
 * without a view is picked; everything else falls back to `world`.
 */
const FALLBACK_MODE_FOR_VIEW: Readonly<Record<string, EditorMode>> = {
  cast: 'cast',
  tiles: 'tiles',
  data: 'data',
}

/** Where the rail should land when the picked mode has no view of its own. */
export function fallbackModeForView(currentView: string | null): EditorMode {
  return (currentView ? FALLBACK_MODE_FOR_VIEW[currentView] : undefined) ?? 'world'
}

/** Outcome of a `win.mode` change-state, resolved without touching GTK. */
export type ModeNavigation =
  | { readonly kind: 'navigate'; readonly view: ViewName }
  /** The mode has no view yet — toast, then snap the rail back to `fallback`. */
  | { readonly kind: 'unimplemented'; readonly fallback: EditorMode }
  /** Nothing to do: no project open, or an unknown mode id. */
  | { readonly kind: 'ignore' }

/**
 * Resolve a mode-rail selection to a navigation.
 *
 * Every project-scoped mode is inert without a loaded project: from the
 * welcome view the user has to open a project first, so clicking the rail
 * must not bounce them out of whatever they are looking at.
 */
export function resolveModeNavigation(mode: string, hasProject: boolean, currentView: string | null): ModeNavigation {
  if (mode === 'audio') return { kind: 'unimplemented', fallback: fallbackModeForView(currentView) }
  const view = VIEW_FOR_MODE[mode as EditorMode]
  if (!view) return { kind: 'ignore' }
  return hasProject ? { kind: 'navigate', view } : { kind: 'ignore' }
}
