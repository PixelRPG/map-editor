import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { confirmDestructive } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import type { EntityTemplate } from '../../services/entity-templates.ts'

/**
 * Pick the starting template for a new thing. `templates` is
 * the project's effective set (built-ins plus the templates of every
 * switched-on game system), so the chooser never offers a template that
 * seeds components the project cannot render.
 */
export function presentTemplateChooser(
  parent: Gtk.Widget,
  templates: readonly EntityTemplate[],
  onPick: (templateId: string) => void,
): void {
  const dialog = new Adw.AlertDialog({
    heading: _('New thing'),
    body: _('Pick a starting template — you can change everything afterwards.'),
  })
  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['boxed-list'] })
  for (const template of templates) {
    // Characters are added on the Characters page.
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

/** Confirm removing a thing from the project library. */
export function confirmObjectDelete(parent: Gtk.Widget, name: string, onConfirmed: () => void): void {
  void confirmDestructive(parent, {
    heading: _('Delete thing?'),
    body: _('“%s” will be removed from the project.').replace('%s', name),
  }).then((confirmed) => {
    if (confirmed) onConfirmed()
  })
}
