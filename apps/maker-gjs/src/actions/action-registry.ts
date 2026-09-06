import type Gio from '@girs/gio-2.0'

/**
 * Registration guard for the window's `win.*` action group.
 *
 * `g_action_map_add_action` REPLACES a same-named action instead of
 * reporting a conflict. That is how this app once shipped a dead
 * `Gio.PropertyAction`: `win.toggle-inspector` was registered twice —
 * the PropertyAction first, a stateless `SimpleAction` after — and the
 * second silently won, so every consumer bound to the action's STATE
 * (an `Adw`/`Gtk.ToggleButton`'s `active`) had nothing to reflect and
 * nothing anywhere said so.
 *
 * Two layers close that class:
 *
 * 1. {@link addAction} — the only way the `install*Actions` modules add
 *    an action. It throws on a name the group already holds, so a
 *    duplicate is a hard failure at the point of registration instead
 *    of a silent replacement.
 * 2. {@link WINDOW_ACTION_NAMES} — the declared full set. The spec
 *    installs every module into a real action group and asserts the
 *    result matches this list exactly, so an action added without
 *    declaring it (or declared twice) fails CI, not a user's session.
 */

/** The slice of `Gio.ActionMap` {@link addAction} needs — a real `Gio.SimpleActionGroup` in production. */
export interface ActionRegistry {
  lookup_action(name: string): Gio.Action | null
  add_action(action: Gio.Action): void
}

/** Thrown when an action name is registered twice into the same group. */
export class DuplicateActionError extends Error {
  constructor(readonly actionName: string) {
    super(
      `Action "${actionName}" is already registered in this group. ` +
        'g_action_map_add_action would silently REPLACE the first registration, ' +
        'leaving it dead — rename one of them or install only one.',
    )
    this.name = 'DuplicateActionError'
  }
}

/**
 * Add `action` to `group`, refusing a name the group already holds.
 * Use this instead of `group.add_action` everywhere in `src/actions/`.
 */
export function addAction(group: ActionRegistry, action: Gio.Action): void {
  const name = action.get_name()
  if (group.lookup_action(name)) throw new DuplicateActionError(name)
  group.add_action(action)
}

/**
 * Every `win.*` action the maker window installs, grouped by the
 * `install*Actions` module that owns it. Kept as a literal (not derived
 * from the modules) so it is a genuine second statement of intent:
 * `window-actions.gjs.spec.ts` reconciles it against really-installed
 * groups, so the two can only agree by being right.
 */
export const WINDOW_ACTION_NAMES_BY_MODULE = {
  view: ['mode', 'library-chip', 'back-to-atlas', 'open-scene', 'open-scene-by-id', 'show-full-view'],
  project: ['open-project', 'close-project', 'open-recent-projects', 'new-scene'],
  zoom: ['zoom-in', 'zoom-out', 'zoom-reset', 'atlas-fit'],
  editing: ['set-tool', 'set-object-brush', 'select-placement', 'undo', 'redo', 'new-layer'],
  inspector: [
    'set-inspector-tab',
    'toggle-library',
    'toggle-inspector',
    'toggle-objects',
    'toggle-grid',
    'toggle-transparency',
  ],
  playtest: ['play'],
  session: ['share-session', 'toggle-assistant-paused'],
  cast: ['new-character', 'open-character', 'place-character', 'edit-appearance', 'new-animation'],
  tile: ['new-spriteset', 'new-tileset', 'open-tileset', 'open-appearance', 'switch-tileset'],
  object: ['new-object', 'open-object', 'toggle-object-cast'],
} as const satisfies Record<string, readonly string[]>

/** Every declared `win.*` action name, flattened across the modules. */
export const WINDOW_ACTION_NAMES: readonly string[] = Object.values(WINDOW_ACTION_NAMES_BY_MODULE).flat()

/** Names occurring more than once in `names`, each reported once, in first-seen order. */
export function duplicateActionNames(names: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) duplicates.add(name)
    seen.add(name)
  }
  return [...duplicates]
}
