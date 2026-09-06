import Gio from '@girs/gio-2.0'
import { gettext as _ } from 'gettext'
import { addAction } from './action-registry.ts'

/** What the project lifecycle actions need from the window. */
export interface ProjectActionsContext {
  /** Drive the file picker — the same path as the welcome view's button. */
  openProject(): void
  /** Present the recent-projects dialog (the primary menu's "Open Recent"). */
  presentRecentProjects(): void
  closeProject(): void
  showToast(message: string): void
}

/**
 * Project lifecycle actions.
 *
 * `open-recent-projects` was registered WITHOUT a handler for as long as
 * it existed, on the strength of a comment claiming the welcome view
 * bound a button to it "purely to reveal its recents column" — nothing
 * in the welcome view ever referenced the action. Its two real
 * consumers, the primary menu's "Open Recent" item and a rail footer
 * button, were both inert in every build. The menu item now presents a
 * dialog; the footer button is gone (it duplicated the item).
 */
export function installProjectActions(group: Gio.SimpleActionGroup, ctx: ProjectActionsContext): void {
  const openProject = new Gio.SimpleAction({ name: 'open-project' })
  openProject.connect('activate', () => ctx.openProject())
  addAction(group, openProject)

  const closeProject = new Gio.SimpleAction({ name: 'close-project' })
  closeProject.connect('activate', () => ctx.closeProject())
  addAction(group, closeProject)

  const openRecent = new Gio.SimpleAction({ name: 'open-recent-projects' })
  openRecent.connect('activate', () => ctx.presentRecentProjects())
  addAction(group, openRecent)

  const newScene = new Gio.SimpleAction({ name: 'new-scene' })
  newScene.connect('activate', () => ctx.showToast(_('New map — not yet implemented')))
  addAction(group, newScene)
}
