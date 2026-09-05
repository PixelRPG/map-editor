import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { addAction } from './action-registry.ts'

/** What the playtest toggle needs from the window. */
export interface PlaytestActionsContext {
  /** Best-effort save before runtime so a crash mid-playtest can't lose work. */
  persistCurrentMap(): void
  /** Swap `EditorModeComponent` ↔ `RuntimeModeComponent` on the active scene. */
  setRuntimeMode(playing: boolean): void
  /** Swap the FloatingPlay pill's icon + label. */
  setViewPlaying(playing: boolean): void
}

/**
 * `win.play` — the playtest toggle. Stateful boolean: the FloatingPlay
 * button activates it, `activate` flips the state and `change-state`
 * forwards into the engine, whose `PlayerSystem` reveals and drives the
 * player actor in runtime and hides it again in editor mode.
 */
export function installPlaytestActions(
  group: Gio.SimpleActionGroup,
  ctx: PlaytestActionsContext,
): { play: Gio.SimpleAction } {
  const play = Gio.SimpleAction.new_stateful('play', null, GLib.Variant.new_boolean(false))
  play.connect('activate', () => {
    play.change_state(GLib.Variant.new_boolean(!(play.get_state()?.get_boolean() ?? false)))
  })
  play.connect('change-state', (action, value) => {
    action.set_state(value!)
    const isPlaying = value!.get_boolean()
    if (isPlaying) ctx.persistCurrentMap()
    ctx.setRuntimeMode(isPlaying)
    ctx.setViewPlaying(isPlaying)
  })
  addAction(group, play)

  return { play }
}
