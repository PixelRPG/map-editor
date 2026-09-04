import { describe, expect, it } from '@gjsify/unit'
import type { CharacterAnimation, CharacterDefinition } from '@pixelrpg/engine'

import {
  appearanceLabel,
  characterSpeed,
  countSheetUsers,
  filterCharactersByRole,
  findAnimationToEdit,
  findCharacterById,
  findCharacterBySheet,
} from './cast-view-model.ts'

const character = (id: string, kind: 'hero' | 'npc', spriteSetId: string): CharacterDefinition => ({
  id,
  name: id.toUpperCase(),
  kind,
  spriteSetId,
})

const roster: CharacterDefinition[] = [
  character('link', 'hero', 'hero-sheet'),
  character('villager', 'npc', 'npc-sheet'),
  character('guard', 'npc', 'npc-sheet'),
]

const ids = (characters: readonly CharacterDefinition[]): string[] => characters.map((c) => c.id)

export default async () => {
  await describe('filterCharactersByRole', async () => {
    await it('admits everything for "all", in project order', async () => {
      expect(ids(filterCharactersByRole(roster, 'all'))).toStrictEqual(['link', 'villager', 'guard'])
    })

    await it('splits heroes from NPCs', async () => {
      expect(ids(filterCharactersByRole(roster, 'heroes'))).toStrictEqual(['link'])
      expect(ids(filterCharactersByRole(roster, 'npcs'))).toStrictEqual(['villager', 'guard'])
    })

    await it('yields nothing for an empty roster', async () => {
      expect(filterCharactersByRole([], 'heroes')).toStrictEqual([])
    })
  })

  await describe('findCharacterById', async () => {
    await it('resolves a known id', async () => {
      expect(findCharacterById(roster, 'guard')?.id).toBe('guard')
    })

    await it('has no character for a missing or absent id', async () => {
      expect(findCharacterById(roster, 'nobody')).toBe(null)
      expect(findCharacterById(roster, null)).toBe(null)
    })
  })

  await describe('findCharacterBySheet', async () => {
    await it('picks the FIRST character wearing the sheet', async () => {
      expect(findCharacterBySheet(roster, 'npc-sheet')?.id).toBe('villager')
    })

    await it('reports an orphan appearance', async () => {
      expect(findCharacterBySheet(roster, 'unused-sheet')).toBe(null)
    })
  })

  await describe('countSheetUsers', async () => {
    await it('counts every character sharing an appearance', async () => {
      expect(countSheetUsers(roster, 'npc-sheet')).toBe(2)
      expect(countSheetUsers(roster, 'hero-sheet')).toBe(1)
      expect(countSheetUsers(roster, 'unused-sheet')).toBe(0)
    })
  })

  await describe('findAnimationToEdit', async () => {
    const sheetWalk: CharacterAnimation = { id: 'walk-down', frames: [] }
    const legacyWalk: CharacterAnimation = { id: 'walk-down', frames: [], loop: false }

    await it('has nothing to open for a brand-new animation', async () => {
      expect(findAnimationToEdit(null, [sheetWalk], [legacyWalk])).toBe(null)
    })

    await it('prefers the sheet-owned animation', async () => {
      expect(findAnimationToEdit('walk-down', [sheetWalk], [legacyWalk])).toBe(sheetWalk)
    })

    await it("falls back to the character's legacy list only when the sheet carries none", async () => {
      expect(findAnimationToEdit('walk-down', undefined, [legacyWalk])).toBe(legacyWalk)
      // An empty sheet list deliberately shadows the legacy entries.
      expect(findAnimationToEdit('walk-down', [], [legacyWalk])).toBe(null)
    })

    await it('reports an unknown animation id as absent', async () => {
      expect(findAnimationToEdit('sword-swing', [sheetWalk], undefined)).toBe(null)
      expect(findAnimationToEdit('walk-down', undefined, undefined)).toBe(null)
    })
  })

  await describe('characterSpeed', async () => {
    await it('defaults to 4 tiles/second', async () => {
      expect(characterSpeed(character('a', 'npc', 's'))).toBe(4)
    })

    await it('honours an explicit speed, zero included', async () => {
      expect(characterSpeed({ ...character('a', 'npc', 's'), speedTilesPerSec: 7 })).toBe(7)
      expect(characterSpeed({ ...character('a', 'npc', 's'), speedTilesPerSec: 0 })).toBe(0)
    })
  })

  await describe('appearanceLabel', async () => {
    const sheets = [{ id: 'hero-sheet', name: 'Hero sheet' }]

    await it('names the sheet the character wears', async () => {
      expect(appearanceLabel(character('link', 'hero', 'hero-sheet'), sheets)).toBe('Hero sheet')
    })

    await it('falls back to the raw sheet id for an unlisted appearance', async () => {
      expect(appearanceLabel(character('ghost', 'npc', 'missing'), sheets)).toBe('missing')
    })
  })
}
