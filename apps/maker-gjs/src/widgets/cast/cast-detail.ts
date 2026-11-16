import type { CharacterDefinition } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

/** One line saying what a character's role means on a map. */
export function characterSubtitle(character: CharacterDefinition): string {
  return character.kind === 'hero' ? _("Hero · spawns at the map's player spawn-point") : _('NPC · placed on maps')
}
