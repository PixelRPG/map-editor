import Gio from '@girs/gio-2.0'
import { gettext as _ } from 'gettext'

/**
 * The map context menu — one model, three surfaces: the selection
 * bar's "⋯", a long press on a card and a secondary click on a card.
 *
 * Every item is a stateless window action that reads the current
 * selection, the same contract as the placement menu in
 * `scene-editor.ts`: the gesture selects the map before the menu
 * opens, so nothing is carried in an action target. Built fresh per
 * call because `Gtk.PopoverMenu` takes ownership of the model.
 */
export function buildMapContextMenu(): Gio.Menu {
  const model = new Gio.Menu()
  model.append(_('Rename…'), 'win.rename-map')
  model.append(_('Duplicate'), 'win.duplicate-map')
  model.append(_('Start the game here'), 'win.start-map')
  model.append(_('Delete'), 'win.delete-map')
  return model
}
