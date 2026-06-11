import { describe, expect, it } from '@gjsify/unit'

import type { EntityDefinition, GameProjectData, MapData, SpriteSetData, SpriteSetReference } from '../types/index.ts'
import {
  applyEntityRemove,
  applyEntityUpsert,
  applyMapEditorData,
  applyPlayerSet,
  applyProjectMetaUpdate,
  applySpriteSetReference,
  applySpriteSetRemove,
  applySpriteSetUpdate,
  chunkSpriteSetAdd,
  chunkSpriteSetUpdate,
  createEntityRemoveOp,
  createEntityUpsertOp,
  createMapEditorDataOp,
  createPlayerSetOp,
  createProjectMetaUpdateOp,
  createSpriteSetRemoveOp,
  ENTITY_REMOVE_KIND,
  ENTITY_UPSERT_KIND,
  isProjectOp,
  MAP_EDITOR_DATA_KIND,
  OpChunkReassembler,
  PLAYER_SET_KIND,
  PROJECT_META_UPDATE_KIND,
  PROJECT_OP_PREFIX,
  SPRITESET_REMOVE_KIND,
  SPRITESET_UPDATE_CHUNK_KIND,
  type SpriteSetAddChunkOp,
  type SpriteSetAddPayload,
  SpriteSetAddReassembler,
  type SpriteSetUpdateChunkOp,
  type SpriteSetUpdatePayload,
} from './project-operations.ts'

function spriteSetData(id: string, _imageBase64Len = 8): SpriteSetData {
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

function entity(id: string, extra: Partial<EntityDefinition> = {}): EntityDefinition {
  return {
    id,
    name: id,
    components: [{ type: 'visual', spriteSetId: 'scientist', spriteId: 0 }],
    editorData: { template: 'character' },
    ...extra,
  }
}

function projectData(entityLibrary: EntityDefinition[], playerActorId?: string): GameProjectData {
  return {
    id: 'p',
    name: 'P',
    version: '1',
    spriteSets: [],
    maps: [],
    startup: { initialMapId: 'm' },
    entityLibrary,
    playerActorId,
  } as unknown as GameProjectData
}

export default async () => {
  await describe('PROJECT_OP_PREFIX + kinds', async () => {
    await it('exposes the prefix and the entity kinds under it', async () => {
      expect(PROJECT_OP_PREFIX).toBe('__project/')
      expect(ENTITY_UPSERT_KIND.startsWith(PROJECT_OP_PREFIX)).toBe(true)
      expect(ENTITY_REMOVE_KIND.startsWith(PROJECT_OP_PREFIX)).toBe(true)
      expect(PLAYER_SET_KIND.startsWith(PROJECT_OP_PREFIX)).toBe(true)
    })
  })

  await describe('isProjectOp', async () => {
    await it('recognises project ops + rejects commands / session-protocol / junk', async () => {
      expect(isProjectOp({ kind: ENTITY_UPSERT_KIND, payload: {}, peerId: 'a', seq: 0 })).toBe(true)
      expect(isProjectOp({ kind: PLAYER_SET_KIND, payload: {}, peerId: 'a', seq: 0 })).toBe(true)
      expect(isProjectOp({ kind: '__project/future', payload: {}, peerId: 'a', seq: 0 })).toBe(true)
      expect(isProjectOp({ kind: 'tile.paint', payload: {}, peerId: 'a', seq: 0 })).toBe(false)
      expect(isProjectOp({ kind: '__session/snapshot-request', payload: {}, peerId: 'a', seq: 0 })).toBe(false)
      expect(isProjectOp(null)).toBe(false)
      expect(isProjectOp({ kind: 123 })).toBe(false)
    })
  })

  await describe('builders', async () => {
    await it('build typed envelopes', async () => {
      const up = createEntityUpsertOp({ peerId: 'p1', seq: 4, entity: entity('hero') })
      expect(up.kind).toBe(ENTITY_UPSERT_KIND)
      expect(up.payload.entity.id).toBe('hero')
      expect(isProjectOp(up)).toBe(true)

      const rm = createEntityRemoveOp({ peerId: 'p1', seq: 5, entityId: 'hero' })
      expect(rm.kind).toBe(ENTITY_REMOVE_KIND)
      expect(rm.payload.entityId).toBe('hero')
      expect(isProjectOp(rm)).toBe(true)

      const ps = createPlayerSetOp({ peerId: 'p1', seq: 6, playerActorId: 'hero' })
      expect(ps.kind).toBe(PLAYER_SET_KIND)
      expect(ps.payload.playerActorId).toBe('hero')
      expect(isProjectOp(ps)).toBe(true)
    })
  })

  await describe('applyEntityUpsert', async () => {
    await it('appends a new entity', async () => {
      const data = projectData([entity('a')])
      applyEntityUpsert(data, entity('b'))
      expect(data.entityLibrary?.map((e) => e.id)).toStrictEqual(['a', 'b'])
    })

    await it('replaces an existing entity by id', async () => {
      const data = projectData([entity('a', { name: 'Old' })])
      applyEntityUpsert(data, entity('a', { name: 'New' }))
      expect(data.entityLibrary?.length).toBe(1)
      expect(data.entityLibrary?.[0].name).toBe('New')
    })

    await it('is idempotent', async () => {
      const data = projectData([])
      applyEntityUpsert(data, entity('a'))
      applyEntityUpsert(data, entity('a'))
      expect(data.entityLibrary?.length).toBe(1)
    })
  })

  await describe('applyEntityRemove + applyPlayerSet', async () => {
    await it('drops the matching entity + leaves the rest', async () => {
      const data = projectData([entity('a'), entity('b')])
      applyEntityRemove(data, 'a')
      expect(data.entityLibrary?.map((e) => e.id)).toStrictEqual(['b'])
    })

    await it('clears playerActorId when the removed entity was the player', async () => {
      const data = projectData([entity('a')], 'a')
      applyEntityRemove(data, 'a')
      expect(data.playerActorId).toBe(undefined)
    })

    await it('player.set sets and clears the player', async () => {
      const data = projectData([entity('a')])
      applyPlayerSet(data, 'a')
      expect(data.playerActorId).toBe('a')
      applyPlayerSet(data, null)
      expect(data.playerActorId).toBe(undefined)
    })
  })

  await describe('meta.update', async () => {
    await it('builds a project op recognised by isProjectOp', async () => {
      const op = createProjectMetaUpdateOp({ peerId: 'p1', seq: 1, name: 'Renamed', properties: { author: 'alice' } })
      expect(op.kind).toBe(PROJECT_META_UPDATE_KIND)
      // Lock the literal wire string — a peer on the other side matches on it.
      expect(op.kind).toBe('__project/meta.update')
      expect(PROJECT_META_UPDATE_KIND.startsWith(PROJECT_OP_PREFIX)).toBe(true)
      expect(isProjectOp(op)).toBe(true)
    })

    await it('send → apply replaces name + the whole properties bag', async () => {
      const data = projectData([])
      data.properties = { author: 'old', stale: 'gone' }
      const op = createProjectMetaUpdateOp({
        peerId: 'p1',
        seq: 2,
        name: 'New Name',
        properties: { author: 'alice', defaultTileSize: 32 },
      })
      applyProjectMetaUpdate(data, op.payload)
      expect(data.name).toBe('New Name')
      // Replace-on-apply: the whole bag lands, stale keys drop.
      expect(data.properties).toStrictEqual({ author: 'alice', defaultTileSize: 32 })
    })

    await it('is idempotent — applying twice equals applying once', async () => {
      const data = projectData([])
      const op = createProjectMetaUpdateOp({ peerId: 'p1', seq: 3, name: 'Twice', properties: { version: '2.0' } })
      applyProjectMetaUpdate(data, op.payload)
      const once = { name: data.name, properties: { ...data.properties } }
      applyProjectMetaUpdate(data, op.payload)
      expect(data.name).toBe(once.name)
      expect(data.properties).toStrictEqual(once.properties)
    })
  })

  await describe('map.editor-data', async () => {
    function mapData(id: string): MapData {
      return {
        id,
        version: '1',
        tileWidth: 16,
        tileHeight: 16,
        columns: 4,
        rows: 4,
        layers: [],
      }
    }

    await it('builds a project op recognised by isProjectOp', async () => {
      const op = createMapEditorDataOp({ peerId: 'p1', seq: 1, mapId: 'overworld', editorData: { atlasX: 5 } })
      expect(op.kind).toBe(MAP_EDITOR_DATA_KIND)
      // Lock the literal wire string — a peer on the other side matches on it.
      expect(op.kind).toBe('__project/map.editor-data')
      expect(MAP_EDITOR_DATA_KIND.startsWith(PROJECT_OP_PREFIX)).toBe(true)
      expect(isProjectOp(op)).toBe(true)
    })

    await it('send → apply lands atlasX/atlasY on the right map only', async () => {
      const overworld = mapData('overworld')
      const dungeon = mapData('dungeon')
      const op = createMapEditorDataOp({
        peerId: 'p1',
        seq: 2,
        mapId: 'dungeon',
        editorData: { atlasX: 320, atlasY: 40 },
      })
      const patched = applyMapEditorData([overworld, dungeon], op.payload)
      expect(patched).toBe(dungeon)
      expect(dungeon.editorData?.atlasX).toBe(320)
      expect(dungeon.editorData?.atlasY).toBe(40)
      expect(overworld.editorData).toBeUndefined()
    })

    await it('merges shallowly — future editor-data keys survive an atlas patch', async () => {
      const map = mapData('m')
      map.editorData = { atlasX: 1, atlasY: 2, camera: { x: 0, y: 0, zoom: 2 } }
      applyMapEditorData([map], { mapId: 'm', editorData: { atlasX: 30, atlasY: 40 } })
      expect(map.editorData).toStrictEqual({ atlasX: 30, atlasY: 40, camera: { x: 0, y: 0, zoom: 2 } })
    })

    await it('is idempotent — applying twice equals applying once', async () => {
      const map = mapData('m')
      const payload = { mapId: 'm', editorData: { atlasX: 7, atlasY: 9 } }
      applyMapEditorData([map], payload)
      const once = { ...map.editorData }
      applyMapEditorData([map], payload)
      expect(map.editorData).toStrictEqual(once)
    })

    await it('ignores an op for a map this peer lacks', async () => {
      const map = mapData('m')
      const patched = applyMapEditorData([map], { mapId: 'unknown', editorData: { atlasX: 1 } })
      expect(patched).toBeNull()
      expect(map.editorData).toBeUndefined()
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

  await describe('chunkSpriteSetUpdate + OpChunkReassembler', async () => {
    await it('round-trips a descriptor-only payload (no image bytes)', async () => {
      const payload: SpriteSetUpdatePayload = { data: spriteSetData('hero') }
      const chunks = chunkSpriteSetUpdate({ transferId: 'host:0', payload })
      expect(chunks.length).toBe(1)
      expect(chunks[0].kind).toBe(SPRITESET_UPDATE_CHUNK_KIND)
      expect(isProjectOp(stampUpdate(chunks[0], 0))).toBe(true)

      const re = new OpChunkReassembler<SpriteSetUpdatePayload>()
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

      const re = new OpChunkReassembler<SpriteSetUpdatePayload>()
      let result: SpriteSetUpdatePayload | null = null
      for (let i = 0; i < chunks.length; i++) result = re.accept(stampUpdate(chunks[i], i)) ?? result
      expect(result?.data.id).toBe('big')
      expect(result?.data.sprites.length).toBe(4000)
    })
  })

  await describe('tile-property edits ride spriteset.update.chunk', async () => {
    await it('a solid-flag change produces a __project/spriteset.update.chunk op', async () => {
      const data = spriteSetData('forest')
      data.sprites[0].solid = true
      const chunks = chunkSpriteSetUpdate({ transferId: 'host:7', payload: { data } })
      expect(chunks.length).toBe(1)
      // Lock the literal wire string — a peer on the other side matches on it.
      expect(chunks[0].kind).toBe('__project/spriteset.update.chunk')
      expect(isProjectOp(stampUpdate(chunks[0], 0))).toBe(true)
    })

    await it('applying a reassembled update lands solid + surface on the receiving descriptor', async () => {
      // Sender: flip solid + set a surface on sprite 0, then chunk.
      const sender = spriteSetData('forest')
      sender.sprites[0].solid = true
      sender.sprites[0].tileProperties = { surface: 'water' }
      const chunks = chunkSpriteSetUpdate({ transferId: 'host:8', payload: { data: sender } })

      // Receiver: reassemble the wire chunks + apply onto its own copy.
      const re = new OpChunkReassembler<SpriteSetUpdatePayload>()
      let payload: SpriteSetUpdatePayload | null = null
      for (let i = 0; i < chunks.length; i++) payload = re.accept(stampUpdate(chunks[i], i)) ?? payload
      expect(payload).not.toBeNull()

      const local = spriteSetData('forest')
      expect(local.sprites[0].solid).toBeUndefined()
      const merged = applySpriteSetUpdate(local, payload as SpriteSetUpdatePayload)
      expect(merged.sprites[0].solid).toBe(true)
      expect(merged.sprites[0].tileProperties?.surface).toBe('water')
    })

    await it('applySpriteSetUpdate pins the local image descriptor', async () => {
      const local = spriteSetData('forest')
      const peer = spriteSetData('forest')
      peer.image = { id: 'main', path: '../../evil.png', type: 'image' }
      peer.sprites[0].solid = true
      const merged = applySpriteSetUpdate(local, { data: peer })
      // Peer metadata lands, but it can't repoint our image file.
      expect(merged.sprites[0].solid).toBe(true)
      expect(merged.image?.path).toBe('forest.png')
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
