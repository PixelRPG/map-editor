import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'
import type { AddableComponentGroup } from './entity-components-editor.model.ts'

/**
 * The "Add an ability" chooser — what the components editor's one button
 * opens, replacing a `Gtk.MenuButton` whose popover listed every addable
 * component type as a flat, unexplained alphabet.
 *
 * A dialog buys the two things that list could not have: a heading per
 * game system (so the choices read as "what this thing can do", in the
 * same words Game › Rules uses) and room for each row's icon. Built
 * imperatively like `reference-picker.ts` — a throwaway form with no
 * state worth keeping between presentations, and the row IS the choice,
 * so there is no confirm button.
 */

const DIALOG_WIDTH = 380
const DIALOG_HEIGHT = 520

/** Present the chooser; `onChoose` gets the component type that was picked. */
export function presentAddComponentDialog(
  parent: Gtk.Widget,
  groups: readonly AddableComponentGroup[],
  onChoose: (type: string) => void,
): void {
  const dialog = new Adw.Dialog({
    title: _('Add an ability'),
    contentWidth: DIALOG_WIDTH,
    contentHeight: DIALOG_HEIGHT,
  })

  const page = new Adw.PreferencesPage()
  for (const group of groups) {
    const prefs = new Adw.PreferencesGroup({ title: _(group.systemLabel) })
    for (const spec of group.specs) {
      const row = new Adw.ActionRow({ title: _(spec.editor.label), activatable: true })
      row.add_prefix(new Gtk.Image({ iconName: spec.editor.icon, valign: Gtk.Align.CENTER }))
      row.add_suffix(new Gtk.Image({ iconName: 'list-add-symbolic', valign: Gtk.Align.CENTER }))
      row.connect('activated', () => {
        dialog.close()
        onChoose(spec.type)
      })
      prefs.add(row)
    }
    page.add(prefs)
  }

  const view = new Adw.ToolbarView({ content: page })
  view.add_top_bar(new Adw.HeaderBar())
  dialog.set_child(view)
  dialog.present(parent)
}
