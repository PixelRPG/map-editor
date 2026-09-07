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
  /**
   * Drop the run's accumulated state so the next one starts identically
   * (decision 14 of the merged concept: Restart clears the save). A
   * playtest that starts the same way every time is what makes it a
   * test — the cost, stated rather than hidden, is that a door the child
   * just unlocked is locked again.
   */
  clearSaveState(): void
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

  /**
   * ↺ Restart — re-enter runtime from the beginning. Stopping and
   * starting again is what "from the beginning" means to the engine, so
   * this is that sequence plus the save wipe, not a second runtime path.
   */
  const restart = new Gio.SimpleAction({ name: 'restart' })
  restart.connect('activate', () => {
    ctx.clearSaveState()
    if (play.get_state()?.get_boolean()) ctx.setRuntimeMode(false)
    ctx.setRuntimeMode(true)
    play.change_state(GLib.Variant.new_boolean(true))
  })
  addAction(group, restart)

  /** ▶ from the spawn point with a clean save — the Full-view split menu's entry. */
  const playFromStart = new Gio.SimpleAction({ name: 'play-from-start' })
  playFromStart.connect('activate', () => {
    ctx.clearSaveState()
    play.change_state(GLib.Variant.new_boolean(true))
  })
  addAction(group, playFromStart)

  return { play }
}
