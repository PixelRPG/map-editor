import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'

import type { RecentProjectEntry } from '../services/recent-projects.ts'
import { buildRecentProjectRow } from './recent-project-row.ts'
import Template from './recent-projects-dialog.blp'

/**
 * The primary menu's "Open Recent": the persisted recent-projects list as
 * a dialog, so it is reachable while a project is open. The welcome
 * view's recents column renders the same rows ({@link buildRecentProjectRow}).
 *
 * Emits `recent-selected` with the project path; the host loads it and
 * closes the dialog. `win.open-recent-projects` presents one.
 */
export class RecentProjectsDialog extends Adw.Dialog {
  declare _recents_list: Gtk.ListBox
  declare _empty_recents_row: Adw.ActionRow

  private _rows: Gtk.Widget[] = []

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgRecentProjectsDialog',
        Template,
        InternalChildren: ['recents_list', 'empty_recents_row'],
        Signals: {
          // Absolute path of the chosen `game-project.json`.
          'recent-selected': { param_types: [GObject.TYPE_STRING] },
        },
      },
      RecentProjectsDialog,
    )
  }

  /** Replace the list; an empty array keeps the built-in placeholder row. */
  setRecentProjects(recents: RecentProjectEntry[]): void {
    for (const row of this._rows) this._recents_list.remove(row)
    this._rows = []
    this._empty_recents_row.set_visible(recents.length === 0)
    for (const recent of recents) {
      const row = buildRecentProjectRow(recent, (path) => this.emit('recent-selected', path))
      this._recents_list.append(row)
      this._rows.push(row)
    }
  }
}

GObject.type_ensure(RecentProjectsDialog.$gtype)
