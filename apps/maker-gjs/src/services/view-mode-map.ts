import type { EditorMode } from '@pixelrpg/gjs'

/**
 * Every destination the router can show, flattened.
 *
 * The window nests two stacks (REDESIGN.md § 3.2): `root_stack` carries
 * `welcome` / `shell` / `map`, and the shell's `Adw.ViewStack` carries the
 * three switcher destinations `world` / `library` / `game`. A single flat
 * union keeps the deep links (`win.mode`, the MCP bridge's `set_view`) and
 * the router's one entry point unchanged — {@link routeForView} is what
 * splits a name back into the two levels.
 */
export type ViewName = 'welcome' | 'world' | 'library' | 'game' | 'map'

/** Where `view` lives: the `root_stack` page, plus the shell page when it has one. */
export interface ViewRoute {
  /** A `root_stack` page name. */
  readonly root: 'welcome' | 'shell' | 'map'
  /** The `shell_stack` page to select, or `null` outside the shell. */
  readonly shell: 'world' | 'library' | 'game' | null
}

const ROUTE_FOR_VIEW: Readonly<Record<ViewName, ViewRoute>> = {
  welcome: { root: 'welcome', shell: null },
  world: { root: 'shell', shell: 'world' },
  library: { root: 'shell', shell: 'library' },
  game: { root: 'shell', shell: 'game' },
  map: { root: 'map', shell: null },
}

/** The two stack pages `view` resolves to. */
export function routeForView(view: ViewName): ViewRoute {
  return ROUTE_FOR_VIEW[view]
}

/**
 * Which shell destination a view belongs to. `welcome` and `map` have
 * none: leaving the switcher where it was is what lets the map editor's
 * back button return to the World page the map was opened from
 * (REDESIGN.md § 3.4).
 */
const MODE_FOR_VIEW: Readonly<Record<ViewName, EditorMode | null>> = {
  welcome: null,
  world: 'world',
  library: 'library',
  game: 'game',
  map: null,
}

/** The shell destination `view` belongs to, or `null` when it has none. */
export function modeForView(view: ViewName): EditorMode | null {
  return MODE_FOR_VIEW[view]
}

/**
 * The view every mode opens. Deliberately EXHAUSTIVE over `EditorMode`
 * (not `Partial`): a mode added to the union without a view here fails
 * `tsc`, and `check-mode-routes.mjs` extends that to the half tsc cannot
 * see — that the view name is a real stack page and that the mode is a
 * destination of the shell's `Adw.ViewStack`.
 */
const VIEW_FOR_MODE: Readonly<Record<EditorMode, ViewName>> = {
  world: 'world',
  library: 'library',
  game: 'game',
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
 * Resolve a shell destination to a navigation.
 *
 * Every project-scoped mode is inert without a loaded project: from the
 * welcome view the user has to open a project first, so a switcher click
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
