import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { gettext as _ } from 'gettext'
import { fillPlaceholders } from '../../utils/placeholders.ts'
import type { MapConnectionKind } from './map-connections.model.ts'

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
 * One end of a connection, named for a menu: which placement to act on
 * and the two things a human can tell two doors apart by.
 */
export interface ConnectionMenuDoor {
  mapId: string
  /** The map's display name, already resolved by the caller. */
  mapName: string
  placementId: string
  tileX: number
  tileY: number
}

/** What the line's popover is built from. */
export interface ConnectionMenuFacts {
  kind: MapConnectionKind
  /** Two doors for a pair, one for a one-way or a broken door. */
  doors: readonly ConnectionMenuDoor[]
  /**
   * The arrival map's name for a one-way, where there is no second
   * door to read it from. Unused for a pair, and `null` for a broken
   * door, which arrives nowhere.
   */
  farMapName: string | null
}

function connectionTitle(facts: ConnectionMenuFacts): string {
  const near = facts.doors[0]?.mapName ?? ''
  if (facts.kind === 'pair') {
    // "↔", not the spec's single "→": § 6.2 was written before a door
    // and its way back became ONE line, and an arrow would now have to
    // pick one of two symmetric directions.
    return fillPlaceholders(_('%1$s ↔ %2$s'), near, facts.doors[1]?.mapName ?? '')
  }
  if (facts.kind === 'one-way') return fillPlaceholders(_('%1$s → %2$s'), near, facts.farMapName ?? '')
  return _('%s → nowhere').replace('%s', near)
}

function goToLabel(door: ConnectionMenuDoor, ambiguous: boolean): string {
  // A pair whose two doors sit on the SAME map — a staircase between two
  // parts of one map — would otherwise offer the same sentence twice,
  // and the whole point of the two items is to pick one of them.
  if (ambiguous) {
    return fillPlaceholders(_('Go to the door at %1$s, %2$s'), String(door.tileX), String(door.tileY))
  }
  return _('Go to the door in “%s”').replace('%s', door.mapName)
}

/**
 * "Go to the door" is `win.focus-placement`, not a verb of its own:
 * opening a map and selecting a placement on it is exactly what that
 * action already does, down to the same `(ss)` target.
 */
function goToItem(door: ConnectionMenuDoor, label: string): Gio.MenuItem {
  const item = Gio.MenuItem.new(label, null)
  item.set_action_and_target_value('win.focus-placement', new GLib.Variant('(ss)', [door.mapId, door.placementId]))
  return item
}

/**
 * The popover behind a door line on the atlas (REDESIGN.md § 6.2):
 * which passage this is, a way to each door it is drawn from, and the
 * one edit the atlas can make to it.
 *
 * Unlike {@link buildMapContextMenu} every item carries its target. A
 * line is not a selection — the atlas has no "selected connection" and
 * should not grow one just to park two ids somewhere, so the canvas
 * builds this model per press from the hit it already has.
 *
 * *Remove* clears the door's destination; it does not delete the
 * placement. The door stays a door that goes nowhere, which the atlas
 * draws as a red stub — deleting would throw away the sprite, the
 * collider and a hand-placed position, and nothing here asked for
 * that. For a pair it clears BOTH ends, because a one-way remnant of a
 * passage someone just removed is not what "remove" promised. A broken
 * door gets no *Remove* at all: there is nothing left to clear, and the
 * repair below overwrites the dead reference anyway.
 */
export function buildConnectionMenu(facts: ConnectionMenuFacts): Gio.Menu {
  const section = new Gio.Menu()
  const doors = facts.doors
  const ambiguous = doors.length > 1 && doors[0]?.mapName === doors[1]?.mapName
  for (const door of doors) {
    section.append_item(goToItem(door, doors.length > 1 ? goToLabel(door, ambiguous) : _('Go to the door')))
  }

  if (facts.kind === 'broken') {
    const fix = Gio.MenuItem.new(_('Goes to…'), null)
    const door = doors[0]
    if (door) {
      fix.set_action_and_target_value('win.fix-door', new GLib.Variant('(ss)', [door.mapId, door.placementId]))
      section.append_item(fix)
    }
  } else {
    const remove = Gio.MenuItem.new(_('Remove'), null)
    const pairs = doors.map((door): [string, string] => [door.mapId, door.placementId])
    remove.set_action_and_target_value('win.unlink-door', new GLib.Variant('a(ss)', pairs))
    section.append_item(remove)
  }

  const model = new Gio.Menu()
  model.append_section(connectionTitle(facts), section)
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
