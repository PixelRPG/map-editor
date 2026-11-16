import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { gettext as _ } from 'gettext'
import { addAction } from './action-registry.ts'

/** What the connection verbs need from the window. */
export interface ConnectionActionsContext {
  /**
   * Open `mapId` in the editor and run `then` once its map data is
   * live — `SceneNavigator.open`, not the engine's `map-loaded`.
   */
  openMap(mapId: string, then: () => void): void
  /** Clear the destination of a door on the map that is now open. */
  clearDoorTarget(placementId: string): boolean
  /** Ask where a door on the map that is now open should lead. */
  askWhereDoorGoes(placementId: string): void
  showToast(message: string): void
}

/**
 * The two edits the atlas's door lines offer (REDESIGN.md § 6.2):
 * remove a connection, and give a broken door a destination. Grouped
 * per noun like `map` / `cast` / `tile`, because a connection is its
 * own thing and not a property of either map it joins.
 *
 * Both carry their doors in the action target rather than reading a
 * selection. A line is not a selection — the atlas has no "selected
 * connection", and inventing one so two ids could be parked somewhere
 * would be a second place that has to be kept in step with the drawing.
 * That also makes both reachable from the Control plane with nothing
 * selected at all.
 *
 * Both begin by NAVIGATING to the door's own map and leave the user
 * there. The edit is a scene command on that map's undo stack, and
 * those stacks are per scene: a verb that bounced back to the atlas
 * would leave an undo entry on a stack the user is no longer looking
 * at. Uniformly, not only when the map happens to be the open one — a
 * verb whose aftermath depends on where you were is a verb nobody can
 * predict.
 *
 * "Go to the door" is not here: that is `win.focus-placement`, which
 * already opens a map and selects a placement on it.
 */
export function installConnectionActions(group: Gio.SimpleActionGroup, ctx: ConnectionActionsContext): void {
  // `a(ss)`, not `(ss)`: *Remove* on a pair removes the PASSAGE, so it
  // clears both ends — minus any end a second passage shares, which the
  // menu leaves out of the target. One map at a time is all the editor
  // can hold, so the ends are done in sequence, each on its own map.
  const unlinkDoor = Gio.SimpleAction.new('unlink-door', GLib.VariantType.new('a(ss)'))
  unlinkDoor.connect('activate', (_action, parameter) => {
    const doors = (parameter?.deepUnpack() as Array<[string, string]> | undefined) ?? []
    if (!doors.length) return
    const clearFrom = (index: number, cleared: number): void => {
      const door = doors[index]
      if (!door) {
        ctx.showToast(removalMessage(doors.length, cleared))
        return
      }
      ctx.openMap(door[0], () => clearFrom(index + 1, cleared + (ctx.clearDoorTarget(door[1]) ? 1 : 0)))
    }
    clearFrom(0, 0)
  })
  addAction(group, unlinkDoor)

  const fixDoor = Gio.SimpleAction.new('fix-door', GLib.VariantType.new('(ss)'))
  fixDoor.connect('activate', (_action, parameter) => {
    const [mapId, placementId] = (parameter?.deepUnpack() as [string, string] | undefined) ?? []
    if (!mapId || !placementId) return
    ctx.openMap(mapId, () => ctx.askWhereDoorGoes(placementId))
  })
  addAction(group, fixDoor)
}

/**
 * What to say after a removal. Branching on one-or-two rather than
 * using a plural form: a connection has exactly one or exactly two
 * ends, and "these two doors" is a better sentence than anything a
 * plural rule would build out of a count.
 *
 * A partial result is reported as such. It means the door's map refused
 * the write — a locked layer, or a placement that is no longer there —
 * and silently claiming success would leave a half-removed passage the
 * atlas still draws.
 */
function removalMessage(total: number, cleared: number): string {
  if (cleared === 0) return _('Could not remove this connection')
  if (cleared < total) return _('Only one end could be removed')
  if (total === 1) return _('This door no longer leads anywhere')
  return _('These two doors no longer lead anywhere')
}
