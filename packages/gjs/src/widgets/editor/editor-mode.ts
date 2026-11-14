/**
 * The project shell's three top-level destinations: World (the maps),
 * Library (characters, things and graphics) and Game (the project's own
 * page).
 *
 * Lives in its own module rather than next to a widget because no single
 * widget owns it any more: the `win.mode` action, the window's
 * `Adw.ViewStack` page names and the `Adw.ViewSwitcher` rows all speak
 * this vocabulary. It used to live in `mode-rail.ts`, which the
 * navigation redesign deleted (REDESIGN.md § 3.1).
 */
export type EditorMode = 'world' | 'library' | 'game'

/**
 * The destinations in the order the view switcher shows them. Iterated
 * where a mode-indexed structure has to be exhaustive, and used by
 * `check-mode-routes.mjs` as the list every route must cover.
 */
export const MODE_ORDER: readonly EditorMode[] = ['world', 'library', 'game']

/** Whether an arbitrary string names one of the shell's destinations. */
export function isEditorMode(mode: string): mode is EditorMode {
  return (MODE_ORDER as readonly string[]).includes(mode)
}
