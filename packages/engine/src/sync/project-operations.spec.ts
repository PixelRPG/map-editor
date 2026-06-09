import { describe, expect, it } from '@gjsify/unit'

import type { CharacterDefinition, GameProjectData, SpriteSetData, SpriteSetReference } from '../types/index.ts'
import {
  applyCharacterRemove,
  applyCharacterUpsert,
  applySpriteSetReference,
  applySpriteSetRemove,
  CHARACTER_REMOVE_KIND,
  CHARACTER_UPSERT_KIND,
  chunkSpriteSetAdd,
  chunkSpriteSetUpdate,
  ChunkReassembler,
  createCharacterRemoveOp,
  createCharacterUpsertOp,
  createSpriteSetRemoveOp,
  isProjectOp,
  PROJECT_OP_PREFIX,
  type SpriteSetAddChunkOp,
  type SpriteSetAddPayload,
  SpriteSetAddReassembler,
  type SpriteSetUpdateChunkOp,
  type SpriteSetUpdatePayload,
  SPRITESET_REMOVE_KIND,
  SPRITESET_UPDATE_CHUNK_KIND,
} from './project-operations.ts'

function spriteSetData(id: string, imageBase64Len = 8): SpriteSetData {
  return {
    version: '1.0.0',
    id,
    name: id,
    image: { id: 'main', path: `${id}.png`, type: 'image' },
    spriteWidth: 16,
    spriteHeight: 16,
    columns: 1,
    rows: 1,
    sprites: [{ id: 0, col: 0, row: 0 }],
  } as SpriteSetData
}

function stamp(op: Omit<SpriteSetAddChunkOp, 'peerId' | 'seq'>, seq: number): SpriteSetAddChunkOp {
  return { ...op, peerId: 'host', seq } as SpriteSetAddChunkOp
}

function stampUpdate(op: Omit<SpriteSetUpdateChunkOp, 'peerId' | 'seq'>, seq: number): SpriteSetUpdateChunkOp {
  return { ...op, peerId: 'host', seq } as SpriteSetUpdateChunkOp
}

function character(id: string, extra: Partial<CharacterDefinition> = {}): CharacterDefinition {
  return {
    id,
    name: id,
    kind: 'npc',
    spriteSetId: 'scientist',
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

  await describe('chunkSpriteSetAdd + SpriteSetAddReassembler', async () => {
    await it('round-trips a small payload through a single chunk', async () => {
      const payload: SpriteSetAddPayload = { data: spriteSetData('hero'), imageBase64: 'AAAA' }
      const chunks = chunkSpriteSetAdd({ transferId: 'host:0', payload })
      expect(chunks.length).toBe(1)
      expect(isProjectOp(stamp(chunks[0], 0))).toBe(true)

      const re = new SpriteSetAddReassembler()
      const result = re.accept(stamp(chunks[0], 0))
      expect(result).not.toBeNull()
      expect(result?.data.id).toBe('hero')
      expect(result?.imageBase64).toBe('AAAA')
    })

    await it('splits a large payload into many chunks + reassembles', async () => {
      // 40 KiB of base64 forces >1 chunk (16 KiB budget each).
      const payload: SpriteSetAddPayload = { data: spriteSetData('big'), imageBase64: 'A'.repeat(40 * 1024) }
      const chunks = chunkSpriteSetAdd({ transferId: 'host:1', payload })
      expect(chunks.length).toBeGreaterThan(1)
      expect(chunks.every((c) => c.payload.totalChunks === chunks.length)).toBe(true)

      const re = new SpriteSetAddReassembler()
      let result: SpriteSetAddPayload | null = null
      for (let i = 0; i < chunks.length; i++) {
        result = re.accept(stamp(chunks[i], i)) ?? result
      }
      expect(result).not.toBeNull()
      expect(result?.data.id).toBe('big')
      expect(result?.imageBase64.length).toBe(40 * 1024)
    })

    await it('reassembles out-of-order chunks', async () => {
      const payload: SpriteSetAddPayload = { data: spriteSetData('ooo'), imageBase64: 'B'.repeat(40 * 1024) }
      const chunks = chunkSpriteSetAdd({ transferId: 'host:2', payload }).map((c, i) => stamp(c, i))
      const re = new SpriteSetAddReassembler()
      // Feed reversed; only the final (completing) chunk yields a payload.
      const reversed = [...chunks].reverse()
      let result: SpriteSetAddPayload | null = null
      for (const c of reversed) result = re.accept(c) ?? result
      expect(result?.data.id).toBe('ooo')
      expect(result?.imageBase64.length).toBe(40 * 1024)
    })
  })

  await describe('chunkSpriteSetUpdate + ChunkReassembler', async () => {
    await it('round-trips a descriptor-only payload (no image bytes)', async () => {
      const payload: SpriteSetUpdatePayload = { data: spriteSetData('hero') }
      const chunks = chunkSpriteSetUpdate({ transferId: 'host:0', payload })
      expect(chunks.length).toBe(1)
      expect(chunks[0].kind).toBe(SPRITESET_UPDATE_CHUNK_KIND)
      expect(isProjectOp(stampUpdate(chunks[0], 0))).toBe(true)

      const re = new ChunkReassembler<SpriteSetUpdatePayload>()
      const result = re.accept(stampUpdate(chunks[0], 0))
      expect(result).not.toBeNull()
      expect(result?.data.id).toBe('hero')
      // No image bytes ride along — only the descriptor.
      expect((result as unknown as { imageBase64?: string }).imageBase64).toBeUndefined()
    })

    await it('splits a large descriptor into many chunks + reassembles', async () => {
      // A fat descriptor (many sprites) forces >1 chunk (16 KiB budget each).
      const big = spriteSetData('big')
      big.sprites = Array.from({ length: 4000 }, (_v, i) => ({ id: i, col: i % 32, row: Math.floor(i / 32) }))
      const chunks = chunkSpriteSetUpdate({ transferId: 'host:1', payload: { data: big } })
      expect(chunks.length).toBeGreaterThan(1)

      const re = new ChunkReassembler<SpriteSetUpdatePayload>()
      let result: SpriteSetUpdatePayload | null = null
      for (let i = 0; i < chunks.length; i++) result = re.accept(stampUpdate(chunks[i], i)) ?? result
      expect(result?.data.id).toBe('big')
      expect(result?.data.sprites.length).toBe(4000)
    })
  })

  await describe('applySpriteSetReference', async () => {
    function ref(id: string, firstGid: number): SpriteSetReference {
      return { id, path: `./spritesets/${id}.json`, type: 'spriteset', firstGid }
    }
    function dataWithSets(refs: SpriteSetReference[]): GameProjectData {
      return {
        id: 'p',
        name: 'P',
        version: '1',
        spriteSets: refs,
        maps: [],
        startup: { initialMapId: 'm' },
      } as unknown as GameProjectData
    }

    await it('appends a new reference', async () => {
      const data = dataWithSets([ref('a', 1)])
      applySpriteSetReference(data, ref('b', 2))
      expect(data.spriteSets.map((s) => s.id)).toStrictEqual(['a', 'b'])
    })

    await it('replaces an existing reference by id (idempotent)', async () => {
      const data = dataWithSets([ref('a', 1)])
      applySpriteSetReference(data, ref('a', 99))
      expect(data.spriteSets.length).toBe(1)
      expect(data.spriteSets[0].firstGid).toBe(99)
    })

    await it('removes a reference by id, idempotent for unknown ids', async () => {
      const data = dataWithSets([ref('a', 1), ref('b', 2)])
      applySpriteSetRemove(data, 'a')
      expect(data.spriteSets.map((s) => s.id)).toStrictEqual(['b'])
      // Re-removing + removing an unknown id are both no-ops.
      applySpriteSetRemove(data, 'a')
      applySpriteSetRemove(data, 'zzz')
      expect(data.spriteSets.map((s) => s.id)).toStrictEqual(['b'])
    })
  })

  await describe('createSpriteSetRemoveOp', async () => {
    await it('builds a project op recognised by isProjectOp', async () => {
      const op = createSpriteSetRemoveOp({ peerId: 'p1', seq: 7, spriteSetId: 'forest' })
      expect(op.kind).toBe(SPRITESET_REMOVE_KIND)
      expect(SPRITESET_REMOVE_KIND.startsWith(PROJECT_OP_PREFIX)).toBe(true)
      expect(op.payload.spriteSetId).toBe('forest')
      expect(op.peerId).toBe('p1')
      expect(op.seq).toBe(7)
      expect(isProjectOp(op)).toBe(true)
    })
  })
}
