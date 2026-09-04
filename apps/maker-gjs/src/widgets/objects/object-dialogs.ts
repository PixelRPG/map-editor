import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { confirmDestructive } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import { ENTITY_TEMPLATES } from '../../services/entity-templates.ts'

/** Pick the starting template for a new library object. */
export function presentTemplateChooser(parent: Gtk.Widget, onPick: (templateId: string) => void): void {
  const dialog = new Adw.AlertDialog({
    heading: _('New object'),
    body: _('Pick a starting template — you can change everything afterwards.'),
  })
  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['boxed-list'] })
  for (const template of ENTITY_TEMPLATES) {
    // Characters live in the Cast view.
    if (template.id === 'character') continue
    const row = new Adw.ActionRow({ title: template.label, subtitle: template.description, activatable: true })
    row.add_prefix(new Gtk.Image({ iconName: template.icon }))
    row.connect('activated', () => {
      dialog.close()
      onPick(template.id)
    })
    list.append(row)
  }
  dialog.set_extra_child(list)
  dialog.add_response('cancel', _('Cancel'))
  dialog.present(parent)
}

/** Confirm removing an object from the project library. */
export function confirmObjectDelete(parent: Gtk.Widget, name: string, onConfirmed: () => void): void {
  void confirmDestructive(parent, {
    heading: _('Delete object?'),
    body: _('“%s” will be removed from the project library.').replace('%s', name),
  }).then((confirmed) => {
    if (confirmed) onConfirmed()
  })
}
