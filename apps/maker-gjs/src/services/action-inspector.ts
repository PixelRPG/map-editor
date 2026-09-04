import type Gio from '@girs/gio-2.0'

/** One `Gio.Action` as surfaced to external tooling via Control. */
export interface ActionDescriptor {
  name: string
  enabled: boolean
  /** D-Bus signature of the action's parameter, or `null` if it takes none. */
  parameterType: string | null
  /** D-Bus signature of the action's state, or `null` if it is stateless. */
  stateType: string | null
}

/**
 * Describe every action in `group`, name-sorted. `Adw.ApplicationWindow`
 * (unlike `Gtk.ApplicationWindow`) has no GActionMap that GtkApplication
 * would export over `org.gtk.Actions`, so this is how a client discovers
 * what it can drive.
 */
export function describeActions(group: Gio.ActionGroup | null): ActionDescriptor[] {
  if (!group) return []
  return group
    .list_actions()
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      enabled: group.get_action_enabled(name),
      parameterType: group.get_action_parameter_type(name)?.dup_string() ?? null,
      stateType: group.get_action_state_type(name)?.dup_string() ?? null,
    }))
}

/** Resolve a scope + name to a live group, throwing the D-Bus-facing error. */
export function requireActionGroup(group: Gio.ActionGroup | null, scope: string, name: string): Gio.ActionGroup {
  if (!group) throw new Error(`No '${scope}' action group`)
  if (!group.has_action(name)) throw new Error(`Unknown action ${scope}.${name}`)
  return group
}
