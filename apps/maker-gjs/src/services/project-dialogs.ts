import Gio from '@girs/gio-2.0'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

/**
 * `Gtk.FileDialog` reports a user-cancelled dialog by throwing; only a
 * real failure is worth a log line.
 */
function warnUnlessDismissed(context: string, error: unknown): void {
  if (error instanceof Error && !error.message.includes('Dismissed')) {
    console.warn(`[project-dialogs] ${context}:`, error)
  }
}

/**
 * "Open Project" — pick any project file in the workspace (the starter
 * templates included). `onChosen` runs only on a real selection.
 */
export function chooseProjectFile(parent: Gtk.Window, onChosen: (path: string) => void): void {
  const dialog = new Gtk.FileDialog({ title: _('Open Project'), modal: true })

  const filter = new Gtk.FileFilter()
  filter.set_name(_('PixelRPG Project (game-project.json)'))
  filter.add_pattern('game-project.json')
  filter.add_pattern('*.json')
  const filters = new Gio.ListStore({ item_type: Gtk.FileFilter.$gtype })
  filters.append(filter)
  dialog.set_filters(filters)
  dialog.set_default_filter(filter)

  dialog.open(parent, null, (_d, result) => {
    try {
      const path = dialog.open_finish(result)?.get_path()
      if (path) onChosen(path)
    } catch (error) {
      warnUnlessDismissed('Open dialog failed', error)
    }
  })
}

/** "New Project" — pick the folder the blank starter gets scaffolded into. */
export function chooseNewProjectFolder(parent: Gtk.Window, onChosen: (dir: string) => void): void {
  const dialog = new Gtk.FileDialog({ title: _('New Project — choose an empty folder'), modal: true })
  dialog.select_folder(parent, null, (_d, result) => {
    let dir: string | null = null
    try {
      dir = dialog.select_folder_finish(result)?.get_path() ?? null
    } catch (error) {
      warnUnlessDismissed('New-project folder dialog failed', error)
      return
    }
    if (dir) onChosen(dir)
  })
}
