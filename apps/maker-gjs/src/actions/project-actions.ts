import Gio from '@girs/gio-2.0'
import { gettext as _ } from 'gettext'

/** What the project lifecycle actions need from the window. */
export interface ProjectActionsContext {
  /** Drive the file picker — the same path as the welcome view's button. */
  openProject(): void
  closeProject(): void
  showToast(message: string): void
}

/**
 * Project lifecycle actions. `open-recent-projects` carries no handler:
 * the welcome view binds a button to it purely to reveal its recents
 * column, which the view does on its own.
 */
export function installProjectActions(group: Gio.SimpleActionGroup, ctx: ProjectActionsContext): void {
  const openProject = new Gio.SimpleAction({ name: 'open-project' })
  openProject.connect('activate', () => ctx.openProject())
  group.add_action(openProject)

  const closeProject = new Gio.SimpleAction({ name: 'close-project' })
  closeProject.connect('activate', () => ctx.closeProject())
  group.add_action(closeProject)

  group.add_action(new Gio.SimpleAction({ name: 'open-recent-projects' }))

  const newScene = new Gio.SimpleAction({ name: 'new-scene' })
  newScene.connect('activate', () => ctx.showToast(_('New Scene — not yet implemented')))
  group.add_action(newScene)
}
