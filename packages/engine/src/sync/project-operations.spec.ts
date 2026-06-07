import { describe, expect, it } from '@gjsify/unit'

import type { CharacterDefinition, GameProjectData } from '../types/index.ts'
import {
  applyCharacterRemove,
  applyCharacterUpsert,
  CHARACTER_REMOVE_KIND,
  CHARACTER_UPSERT_KIND,
  createCharacterRemoveOp,
  createCharacterUpsertOp,
  isProjectOp,
  PROJECT_OP_PREFIX,
} from './project-operations.ts'

function character(id: string, extra: Partial<CharacterDefinition> = {}): CharacterDefinition {
  return {
    id,
    name: id,
    kind: 'npc',
    spriteSetId: 'built-in:scientist',
    animations: [{ id: 'idle-down', frames: [0], durationMs: 200 }],
    ...extra,
  }
}

function projectData(characters: CharacterDefinition[]): GameProjectData {
  return {
    id: 'p',
    name: 'P',
    version: '1',
    spriteSets: [],
    maps: [],
    startup: { initialMapId: 'm' },
    characters,
  } as unknown as GameProjectData
}

export default async () => {
  await describe('PROJECT_OP_PREFIX + kinds', async () => {
    await it('exposes the prefix and both kinds under it', async () => {
      expect(PROJECT_OP_PREFIX).toBe('__project/')
      expect(CHARACTER_UPSERT_KIND.startsWith(PROJECT_OP_PREFIX)).toBe(true)
      expect(CHARACTER_REMOVE_KIND.startsWith(PROJECT_OP_PREFIX)).toBe(true)
    })
  })

  await describe('isProjectOp', async () => {
    await it('recognises project ops + rejects commands / session-protocol / junk', async () => {
      expect(isProjectOp({ kind: CHARACTER_UPSERT_KIND, payload: {}, peerId: 'a', seq: 0 })).toBe(true)
      expect(isProjectOp({ kind: CHARACTER_REMOVE_KIND, payload: {}, peerId: 'a', seq: 0 })).toBe(true)
      expect(isProjectOp({ kind: '__project/future', payload: {}, peerId: 'a', seq: 0 })).toBe(true)
      expect(isProjectOp({ kind: 'tile.paint', payload: {}, peerId: 'a', seq: 0 })).toBe(false)
      expect(isProjectOp({ kind: '__session/snapshot-request', payload: {}, peerId: 'a', seq: 0 })).toBe(false)
      expect(isProjectOp(null)).toBe(false)
      expect(isProjectOp({ kind: 123 })).toBe(false)
    })
  })

  await describe('builders', async () => {
    await it('build typed envelopes', async () => {
      const up = createCharacterUpsertOp({ peerId: 'p1', seq: 4, character: character('hero') })
      expect(up.kind).toBe(CHARACTER_UPSERT_KIND)
      expect(up.payload.character.id).toBe('hero')
      expect(up.peerId).toBe('p1')
      expect(up.seq).toBe(4)
      expect(isProjectOp(up)).toBe(true)

      const rm = createCharacterRemoveOp({ peerId: 'p1', seq: 5, characterId: 'hero' })
      expect(rm.kind).toBe(CHARACTER_REMOVE_KIND)
      expect(rm.payload.characterId).toBe('hero')
      expect(isProjectOp(rm)).toBe(true)
    })
  })

  await describe('applyCharacterUpsert', async () => {
    await it('appends a new character', async () => {
      const data = projectData([character('a')])
      applyCharacterUpsert(data, character('b'))
      expect(data.characters?.map((c) => c.id)).toStrictEqual(['a', 'b'])
    })

    await it('replaces an existing character by id', async () => {
      const data = projectData([character('a', { name: 'Old' })])
      applyCharacterUpsert(data, character('a', { name: 'New' }))
      expect(data.characters?.length).toBe(1)
      expect(data.characters?.[0].name).toBe('New')
    })

    await it('enforces single-player when the upsert is the player', async () => {
      const data = projectData([character('a', { isPlayer: true }), character('b')])
      applyCharacterUpsert(data, character('b', { isPlayer: true }))
      const byId = Object.fromEntries((data.characters ?? []).map((c) => [c.id, c.isPlayer ?? false]))
      expect(byId).toStrictEqual({ a: false, b: true })
    })

    await it('is idempotent', async () => {
      const data = projectData([])
      applyCharacterUpsert(data, character('a', { isPlayer: true }))
      applyCharacterUpsert(data, character('a', { isPlayer: true }))
      expect(data.characters?.length).toBe(1)
      expect(data.characters?.[0].isPlayer).toBe(true)
    })
  })

  await describe('applyCharacterRemove', async () => {
    await it('drops the matching character + leaves the rest', async () => {
      const data = projectData([character('a'), character('b')])
      applyCharacterRemove(data, 'a')
      expect(data.characters?.map((c) => c.id)).toStrictEqual(['b'])
    })

    await it('is a no-op for an unknown id', async () => {
      const data = projectData([character('a')])
      applyCharacterRemove(data, 'zzz')
      expect(data.characters?.map((c) => c.id)).toStrictEqual(['a'])
    })
  })
}
