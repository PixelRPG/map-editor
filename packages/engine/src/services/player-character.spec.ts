/**
 * Player-character resolution on map load.
 *
 * Every branch here is a fallback path: the map must still load — with
 * the scene's procedural placeholder hero — when the project names no
 * player, names one that no longer exists, or names an entity with no
 * appearance to render.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { EntityDefinition, GameProjectData } from '../types/data/index.ts'
import { resolvePlayerCharacter } from './player-character.ts'

const hero: EntityDefinition = {
  id: 'hero',
  name: 'Scientist',
  components: [
    { type: 'visual', spriteSetId: 'scientist', animationId: 'idle-up' },
    { type: 'movement', tilesPerSec: 5 },
  ],
  editorData: { template: 'character' },
}

function project(overrides: Partial<GameProjectData>): GameProjectData {
  return {
    version: '1',
    id: 'proj',
    name: 'Project',
    startup: { initialMapId: 'town' },
    maps: [],
    spriteSets: [],
    ...overrides,
  }
}

export default async () => {
  await describe('resolvePlayerCharacter', async () => {
    await it('maps the entity named by playerActorId to the view model', async () => {
      const character = resolvePlayerCharacter(project({ entityLibrary: [hero], playerActorId: 'hero' }))
      expect(character?.id).toBe('hero')
      expect(character?.spriteSetId).toBe('scientist')
      expect(character?.defaultAnimation).toBe('idle-up')
      expect(character?.speedTilesPerSec).toBe(5)
      expect(character?.isPlayer).toBe(true)
    })

    await it('returns null when the project names no player', async () => {
      expect(resolvePlayerCharacter(project({ entityLibrary: [hero] }))).toBe(null)
    })

    await it('returns null when playerActorId resolves to nothing', async () => {
      expect(resolvePlayerCharacter(project({ entityLibrary: [hero], playerActorId: 'ghost' }))).toBe(null)
    })

    await it('returns null when the project has no entity library at all', async () => {
      expect(resolvePlayerCharacter(project({ playerActorId: 'hero' }))).toBe(null)
    })

    await it('returns null when the named entity carries no sprite set', async () => {
      const faceless: EntityDefinition = { id: 'hero', name: 'Nobody', components: [] }
      expect(resolvePlayerCharacter(project({ entityLibrary: [faceless], playerActorId: 'hero' }))).toBe(null)
    })

    await it('tolerates an absent project', async () => {
      expect(resolvePlayerCharacter(null)).toBe(null)
      expect(resolvePlayerCharacter(undefined)).toBe(null)
    })
  })
}
