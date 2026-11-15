import Gio from '@girs/gio-2.0'
import { gettext as _ } from 'gettext'
import { addAction } from './action-registry.ts'

/** What the map-CRUD actions need from the window. */
export interface MapActionsContext {
  hasProject(): boolean
  showToast(message: string): void
  /** Open the New map dialog — the atlas FAB's verb. */
  presentNewMap(): void
  /** Rename / duplicate / delete the selected atlas card. */
  presentRenameMap(): void
  presentDuplicateMap(): void
  confirmDeleteMap(): void
  /** Point `startup.initialMapId` at the selected map. */
  startHere(): void
  /** Open the Map settings dialog on the selected map. */
  presentMapSettings(): void
}

/**
 * The map-level verbs of the World view: create, rename, duplicate,
 * delete, "start the game here" and the settings dialog
 * (REDESIGN.md § 6.1, § 5.4). Grouped per noun like `cast` / `tile` /
 * `object` rather than folded into `project:`, which owns the project
 * lifecycle.
 *
 * `new-map` replaces the placeholder `new-scene` the atlas FAB used to
 * fire. The other five act on the card the atlas has selected, so the
 * window keeps their handles and re-checks sensitivity whenever the
 * selection or the map list changes — a verb with no target must be
 * visibly unavailable, not a toast after the fact.
 */
export function installMapActions(
  group: Gio.SimpleActionGroup,
  ctx: MapActionsContext,
): {
  renameMap: Gio.SimpleAction
  duplicateMap: Gio.SimpleAction
  deleteMap: Gio.SimpleAction
  startMap: Gio.SimpleAction
  mapSettings: Gio.SimpleAction
} {
  // No enabled toggling: the FAB lives in the atlas, which is only
  // reachable with a project open, and the MCP bridge can still fire
  // this without one — mirroring `installCastActions`.
  const newMap = new Gio.SimpleAction({ name: 'new-map' })
  newMap.connect('activate', () => {
    if (!ctx.hasProject()) {
      ctx.showToast(_('Open a project first'))
      return
    }
    ctx.presentNewMap()
  })
  addAction(group, newMap)

  const renameMap = new Gio.SimpleAction({ name: 'rename-map', enabled: false })
  renameMap.connect('activate', () => ctx.presentRenameMap())
  addAction(group, renameMap)

  const duplicateMap = new Gio.SimpleAction({ name: 'duplicate-map', enabled: false })
  duplicateMap.connect('activate', () => ctx.presentDuplicateMap())
  addAction(group, duplicateMap)

  const deleteMap = new Gio.SimpleAction({ name: 'delete-map', enabled: false })
  deleteMap.connect('activate', () => ctx.confirmDeleteMap())
  addAction(group, deleteMap)

  const startMap = new Gio.SimpleAction({ name: 'start-map', enabled: false })
  startMap.connect('activate', () => ctx.startHere())
  addAction(group, startMap)

  const mapSettings = new Gio.SimpleAction({ name: 'map-settings', enabled: false })
  mapSettings.connect('activate', () => ctx.presentMapSettings())
  addAction(group, mapSettings)

  return { renameMap, duplicateMap, deleteMap, startMap, mapSettings }
}
