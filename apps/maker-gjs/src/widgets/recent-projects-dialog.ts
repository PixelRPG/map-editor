import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'

import type { RecentProjectEntry } from '../services/recent-projects.ts'
import { buildRecentProjectRow } from './recent-project-row.ts'
import Template from './recent-projects-dialog.blp'

/**
 * Typed view of the signals {@link RecentProjectsDialog} registers, layered on the parent's
 * own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface RecentProjectsDialogSignals extends Adw.Dialog.SignalSignatures {
  'recent-selected': (projectPath: string) => void
}

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

  declare connect: GObject.SignalMethods<this, RecentProjectsDialogSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, RecentProjectsDialogSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, RecentProjectsDialogSignals>['emit']

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
