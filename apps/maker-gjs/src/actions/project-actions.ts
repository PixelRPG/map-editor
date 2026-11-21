import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { addAction } from './action-registry.ts'

/** What the project lifecycle actions need from the window. */
export interface ProjectActionsContext {
  /** Drive the file picker — the same path as the welcome view's button. */
  openProject(): void
  /** Present the recent-projects dialog (the primary menu's "Open Recent"). */
  presentRecentProjects(): void
  closeProject(): void
  /** "New game": the welcome card's tap, for Control / automation. */
  createProject(): void
  /** Switch a game system on, with whatever it requires. */
  enableGameSystem(id: string): void
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

  const createProject = new Gio.SimpleAction({ name: 'create-project' })
  createProject.connect('activate', () => ctx.createProject())
  addAction(group, createProject)

  const closeProject = new Gio.SimpleAction({ name: 'close-project' })
  closeProject.connect('activate', () => ctx.closeProject())
  addAction(group, closeProject)

  const openRecent = new Gio.SimpleAction({ name: 'open-recent-projects' })
  openRecent.connect('activate', () => ctx.presentRecentProjects())
  addAction(group, openRecent)

  // The verb behind every "Turn on" button: the dormant-component row in
  // the components editor, and Game › Rules. Switching ON only, because
  // switching off needs the consequences dialog Rules owns.
  const enableGameSystem = Gio.SimpleAction.new('enable-game-system', GLib.VariantType.new('s'))
  enableGameSystem.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (id) ctx.enableGameSystem(id)
  })
  addAction(group, enableGameSystem)
}
