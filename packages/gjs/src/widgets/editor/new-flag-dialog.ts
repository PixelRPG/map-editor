import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { FLAG_KINDS, type FlagKind } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

/** What the dialog hands back: the name typed and the kind picked. */
export interface NewFlagChoice {
  name: string
  kind: FlagKind
}

/** The kind labels, in {@link FLAG_KINDS} order; a function so they follow the locale. */
function kindLabels(): Record<FlagKind, string> {
  return {
    'yes-no': _('Yes or no'),
    number: _('A number'),
    text: _('A word or text'),
  }
}

/**
 * Ask for a new flag's name and kind over `parent`. Create stays off
 * while the name is empty and Enter in the entry activates it; the kind
 * starts on yes/no, the common case. Resolves `null` on cancel.
 */
export function promptNewFlag(parent: Gtk.Widget, fixedKind?: FlagKind): Promise<NewFlagChoice | null> {
  return new Promise((resolve) => {
    const entry = new Gtk.Entry({
      placeholderText: _('Name, like “Has the key”'),
      activatesDefault: true,
    })
    const labels = kindLabels()
    const kinds = new Gtk.DropDown({ model: Gtk.StringList.new(FLAG_KINDS.map((k) => labels[k])) })
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12 })
    box.append(entry)
    if (!fixedKind) box.append(kinds)

    const dialog = new Adw.AlertDialog({
      heading: _('New flag'),
      body: _('A flag is something the game remembers. Give it a name and say what it holds.'),
      extraChild: box,
    })
    dialog.add_response('cancel', _('Cancel'))
    dialog.add_response('create', _('Create'))
    dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED)
    dialog.set_response_enabled('create', false)
    dialog.set_default_response('create')
    dialog.set_close_response('cancel')
    entry.connect('changed', () => dialog.set_response_enabled('create', entry.get_text().trim() !== ''))
    dialog.connect('response', (_d: Adw.AlertDialog, response: string) => {
      const name = entry.get_text().trim()
      resolve(
        response === 'create' && name
          ? { name, kind: fixedKind ?? FLAG_KINDS[kinds.get_selected()] ?? 'yes-no' }
          : null,
      )
    })
    dialog.present(parent)
    entry.grab_focus()
  })
}
