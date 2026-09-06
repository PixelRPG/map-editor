import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

/** One of the active scene's tilesets, as offered by the switcher. */
export interface TilesetChoice {
  id: string
  active: boolean
}

/**
 * Let the user re-point the Tiles-tab palette at another of the scene's
 * tilesets. Callers filter out the single-tileset case first — there is
 * nothing to choose from.
 */
export function presentTilesetSwitcher(
  parent: Gtk.Widget,
  choices: readonly TilesetChoice[],
  onPick: (spriteSetId: string) => void,
): void {
  const dialog = new Adw.AlertDialog({
    heading: _('Switch tileset'),
    body: _('Choose which of this map’s tilesets to paint from.'),
  })
  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['boxed-list'] })
  for (const choice of choices) {
    const row = new Adw.ActionRow({
      title: choice.id,
      subtitle: choice.active ? _('Currently painting') : '',
      activatable: true,
    })
    row.connect('activated', () => {
      dialog.close()
      onPick(choice.id)
    })
    list.append(row)
  }
  dialog.set_extra_child(list)
  dialog.add_response('cancel', _('Cancel'))
  dialog.present(parent)
}
