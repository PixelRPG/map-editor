import { describe, expect, it } from '@gjsify/unit'
import { characterToEntity, type CharacterDefinition, type EntityDefinition } from '@pixelrpg/engine'

import {
  type CastProjectData,
  listAssignableSpriteSets,
  listCharacterViewModels,
  type SpriteSetEntry,
} from './cast-controller-view-model.ts'

function character(id: string, spriteSetId: string): CharacterDefinition {
  return { id, name: id, kind: 'npc', spriteSetId, defaultAnimation: 'idle-down', speedTilesPerSec: 4 }
}

function characterEntity(id: string, spriteSetId: string): EntityDefinition {
  return characterToEntity(character(id, spriteSetId))
}

/** A non-character library entry — must not surface in the cast list. */
const PROP_ENTITY: EntityDefinition = { id: 'barrel', name: 'Barrel', components: [] }

export default async () => {
  await describe('listCharacterViewModels', async () => {
    await it('returns an empty list without a project or library', async () => {
      expect(listCharacterViewModels(null)).toStrictEqual([])
      expect(listCharacterViewModels({})).toStrictEqual([])
    })

    await it('keeps only character-template entries, in library order', async () => {
      const data: CastProjectData = {
        entityLibrary: [characterEntity('hero', 'sheet-a'), PROP_ENTITY, characterEntity('npc', 'sheet-b')],
      }
      expect(listCharacterViewModels(data).map((c) => c.id)).toStrictEqual(['hero', 'npc'])
    })

    await it('derives isPlayer from playerActorId, never from a per-character flag', async () => {
      // The one-of-N invariant is structural: `playerActorId` is a single
      // id, so exactly one character can ever come back flagged.
      const data: CastProjectData = {
        entityLibrary: [characterEntity('hero', 'sheet-a'), characterEntity('npc', 'sheet-b')],
        playerActorId: 'npc',
      }
      expect(
        listCharacterViewModels(data)
          .filter((c) => c.isPlayer)
          .map((c) => c.id),
      ).toStrictEqual(['npc'])
    })
  })

  await describe('listAssignableSpriteSets', async () => {
    const sets = (entries: Array<[string, SpriteSetEntry]>) => new Map<string, SpriteSetEntry>(entries)

    await it('excludes world tilesets nobody uses as an appearance', async () => {
      const choices = listAssignableSpriteSets(
        sets([
          ['hero-sheet', { data: { kind: 'character', name: 'Hero Sheet' } }],
          ['overworld', { data: { kind: 'tileset', name: 'Overworld' } }],
        ]),
        [],
      )
      expect(choices).toStrictEqual([{ id: 'hero-sheet', name: 'Hero Sheet' }])
    })

    await it('includes an untagged sheet a character already references', async () => {
      // Belt-and-suspenders for legacy sets saved before `kind` existed:
      // dropping them would silently break the character using them.
      const choices = listAssignableSpriteSets(sets([['legacy', { data: { name: 'Legacy' } }]]), [
        characterEntity('hero', 'legacy'),
      ])
      expect(choices.map((c) => c.id)).toStrictEqual(['legacy'])
    })

    await it('sorts sets already used by a character first', async () => {
      // The New Character dialog defaults to the first choice — an
      // environment tileset's sprite 0 is usually a transparent tile.
      const choices = listAssignableSpriteSets(
        sets([
          ['fresh', { data: { kind: 'character', name: 'Fresh' } }],
          ['used', { data: { kind: 'character', name: 'Used' } }],
        ]),
        [characterEntity('hero', 'used')],
      )
      expect(choices.map((c) => c.id)).toStrictEqual(['used', 'fresh'])
    })

    await it('falls back to the id when the set carries no name', async () => {
      const choices = listAssignableSpriteSets(sets([['bare', { data: { kind: 'character' } }]]), [])
      expect(choices).toStrictEqual([{ id: 'bare', name: 'bare' }])
    })
  })
}
