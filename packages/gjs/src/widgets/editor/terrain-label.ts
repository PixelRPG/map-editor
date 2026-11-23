import { gettext as _ } from 'gettext'

/** Identity marker: the brush names below are translated at the use site. */
const N_ = (msgid: string): string => msgid

/**
 * The ground brushes the bundled starter tileset ships. Their names live
 * in the tileset's JSON as plain English, so the catalogue has to be told
 * about them here; a brush an author defines themselves is shown as typed.
 */
const SHIPPED_TERRAIN_NAMES: readonly string[] = [
  N_('Path'),
  N_('Stone'),
  N_('Sand'),
  N_('Water'),
  N_('Grass'),
  N_('Autumn leaves'),
  N_('Purple leaves'),
  N_('Red flower bed'),
  N_('White flower bed'),
  N_('Blue flower bed'),
  N_('Pool'),
  N_('Teal rug'),
  N_('Green rug'),
  N_('Orange rug'),
  N_('Green carpet'),
  N_('Orange carpet'),
  N_('Teal carpet'),
]

/** What a brush chip or list row shows for a brush called `name`. */
export function terrainLabel(name: string): string {
  return SHIPPED_TERRAIN_NAMES.includes(name) ? _(name) : name
}
