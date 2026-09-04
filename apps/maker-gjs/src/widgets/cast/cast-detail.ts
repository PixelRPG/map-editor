import Gtk from '@girs/gtk-4.0'
import type { CharacterDefinition } from '@pixelrpg/engine'
import type { SpriteSetChoice } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import { appearanceLabel, characterSpeed } from '../../services/cast-view-model.ts'

/** The read-only summary tiles under the character header, in grid order. */
export const STAT_KEYS = ['appearance', 'movement', 'role', 'collision'] as const

export type StatKey = (typeof STAT_KEYS)[number]

const STAT_TITLES: Record<StatKey, () => string> = {
  appearance: () => _('Appearance'),
  movement: () => _('Movement'),
  role: () => _('Role'),
  collision: () => _('Collision'),
}

/**
 * Fill the detail's 2×2 stat grid and hand back each tile's value label, so
 * a refresh only sets text instead of rebuilding widgets.
 */
export function attachStatTiles(grid: Gtk.Grid): Map<StatKey, Gtk.Label> {
  const values = new Map<StatKey, Gtk.Label>()
  STAT_KEYS.forEach((key, index) => {
    const tile = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 2,
      cssClasses: ['card', 'cast-stat-tile'],
      hexpand: true,
    })
    tile.append(
      new Gtk.Label({ label: STAT_TITLES[key](), halign: Gtk.Align.START, cssClasses: ['caption', 'dim-label'] }),
    )
    const value = new Gtk.Label({
      label: '—',
      halign: Gtk.Align.START,
      xalign: 0,
      wrap: true,
      cssClasses: ['heading'],
    })
    tile.append(value)
    values.set(key, value)
    grid.attach(tile, index % 2, Math.floor(index / 2), 1, 1)
  })
  return values
}

/** What each stat tile reads for a character. */
export function statValues(
  character: CharacterDefinition,
  sheets: readonly SpriteSetChoice[],
): Record<StatKey, string> {
  return {
    appearance: appearanceLabel(character, sheets),
    movement: _(`${characterSpeed(character)} tiles/second`),
    role: character.kind === 'hero' ? _('Hero') : _('NPC'),
    collision: _('On'),
  }
}

/** One line saying what a character's role means on a map. */
export function characterSubtitle(character: CharacterDefinition): string {
  return character.kind === 'hero' ? _("Hero · spawns at the map's player spawn-point") : _('NPC · placed on maps')
}
