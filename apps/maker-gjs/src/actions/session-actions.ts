import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'

/** What the collaboration actions need from the window. */
export interface SessionActionsContext {
  presentShareDialog(): void
  /** The single source of truth for the user's pause switch. */
  setAssistantPaused(paused: boolean): void
  /** Push-down cache on the engine — gates its canvas edit channel. */
  setEngineAssistantPaused(paused: boolean): void
  /** Mirror onto the collaborators bar's AI control. */
  setViewAssistantPaused(paused: boolean): void
}

/**
 * Collaboration actions.
 *
 * `share-session` starts disabled — the mode rail's share button binds to
 * it, so it greys out until a project is open.
 *
 * `toggle-assistant-paused` is HUMAN-ONLY: the Control plane rejects
 * driving it, because the AI must not un-pause itself (see
 * `assistant-pause-policy.ts` and ai-collaborator.md § Pause contract).
 */
export function installSessionActions(
  group: Gio.SimpleActionGroup,
  ctx: SessionActionsContext,
): { share: Gio.SimpleAction } {
  const share = new Gio.SimpleAction({ name: 'share-session' })
  share.set_enabled(false)
  share.connect('activate', () => ctx.presentShareDialog())
  group.add_action(share)

  const assistantPaused = Gio.SimpleAction.new_stateful(
    'toggle-assistant-paused',
    null,
    GLib.Variant.new_boolean(false),
  )
  assistantPaused.connect('activate', () => {
    assistantPaused.change_state(GLib.Variant.new_boolean(!(assistantPaused.get_state()?.get_boolean() ?? false)))
  })
  assistantPaused.connect('change-state', (action, value) => {
    action.set_state(value!)
    const paused = value!.get_boolean()
    ctx.setAssistantPaused(paused)
    ctx.setEngineAssistantPaused(paused)
    ctx.setViewAssistantPaused(paused)
  })
  group.add_action(assistantPaused)

  return { share }
}
