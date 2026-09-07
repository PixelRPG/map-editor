import Adw from '@girs/adw-1'
import type Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import { acceleratorFor, SHORTCUT_SECTIONS } from '../actions/accels.ts'

/**
 * The keyboard-shortcut reference behind `win.show-help-overlay`.
 *
 * Built from {@link SHORTCUT_SECTIONS} rather than written out in a
 * `.blp`, so the keys it shows are the keys the window binds — there is
 * one table, not a template that has to be kept in step with it. The
 * primary menu carried `win.show-help-overlay` for a long time with
 * nothing registered behind it, so the item was greyed out in every
 * build ever made; `accels.spec.ts` now fails if a listed row has no
 * accelerator, which is the same bug one layer earlier.
 *
 * Full view only: every key here also has a visible button or menu item,
 * so Simple view loses nothing by not being offered the list.
 */
export function buildShortcutsDialog(): Adw.ShortcutsDialog {
  const dialog = new Adw.ShortcutsDialog({ title: _('Keyboard Shortcuts') })
  for (const section of SHORTCUT_SECTIONS) {
    const group = new Adw.ShortcutsSection({ title: _(section.title) })
    for (const item of section.items) {
      const accelerator = acceleratorFor(item.action)
      if (!accelerator) continue
      group.add(new Adw.ShortcutsItem({ title: _(item.title), accelerator }))
    }
    dialog.add(group)
  }
  return dialog
}

/** Present the reference over `parent`. */
export function presentShortcutsDialog(parent: Gtk.Widget | null): void {
  buildShortcutsDialog().present(parent)
}
