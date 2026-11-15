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
  model.append(_('Map settings…'), 'win.map-settings')
  model.append(_('Delete'), 'win.delete-map')
  return model
}

/**
 * The World view's own section for the context pill's "⋯"
 * (REDESIGN.md § 4.2) — one item, over the stateful `win.map-list`, so
 * GTK renders it as a check and the menu always states which surface
 * the atlas is showing.
 *
 * List mode is the keyboard- and screen-reader-first path to the maps,
 * which is why it is reachable from a menu at every width rather than
 * from a standing control: with a handful of maps the grid is the
 * better default, and the spec gives the list no toolbar slot of its
 * own until projects with dozens of maps are common.
 */
export function buildMapListSection(): Gio.Menu {
  const model = new Gio.Menu()
  model.append(_('Show as list'), 'win.map-list')
  return model
}
