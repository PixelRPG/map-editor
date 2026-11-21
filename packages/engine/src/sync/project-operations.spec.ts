import { describe, expect, it } from '@gjsify/unit'

import type {
  EntityDefinition,
  GameProjectData,
  MapData,
  MapReference,
  SpriteSetData,
  SpriteSetReference,
} from '../types/index.ts'
import {
  applyCreditsSet,
  createCreditsSetOp,
  CREDITS_SET_KIND,
  applyEntityRemove,
  applyEntityUpsert,
  applyMapCreate,
  applyMapEditorData,
  applyMapSpriteSetsSet,
  applyMapRemove,
  applyMapRename,
  applyPlayerSet,
  applyGameSystemsSet,
  applyProjectMetaUpdate,
  applySpriteSetReference,
  applySpriteSetRemove,
  applySpriteSetUpdate,
  applyStartupSet,
  chunkMapCreate,
  chunkSpriteSetAdd,
  chunkSpriteSetUpdate,
  createEntityRemoveOp,
  createEntityUpsertOp,
  createMapEditorDataOp,
  createMapSpriteSetsSetOp,
  createMapRemoveOp,
  createMapRenameOp,
  createPlayerSetOp,
  createProjectMetaUpdateOp,
  createSpriteSetRemoveOp,
  createStartupSetOp,
  ENTITY_REMOVE_KIND,
  ENTITY_UPSERT_KIND,
  isProjectOp,
  MAP_CREATE_CHUNK_KIND,
  type MapCreateChunkOp,
  type MapCreatePayload,
  MapCreateReassembler,
  MAP_EDITOR_DATA_KIND,
  MAP_SPRITESETS_SET_KIND,
  MAP_REMOVE_KIND,
  MAP_RENAME_KIND,
  OpChunkReassembler,
  PLAYER_SET_KIND,
  STARTUP_SET_KIND,
  createGameSystemsSetOp,
  GAME_SYSTEMS_SET_KIND,
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

  await describe('systems.set', async () => {
    await it('builds a project op recognised by isProjectOp', async () => {
      const op = createGameSystemsSetOp({ peerId: 'p1', seq: 1, gameSystems: { 'combat-action': { enabled: true } } })
      expect(op.kind).toBe(GAME_SYSTEMS_SET_KIND)
      // Lock the literal wire string — a peer on the other side matches on it.
      expect(op.kind).toBe('__project/systems.set')
      expect(GAME_SYSTEMS_SET_KIND.startsWith(PROJECT_OP_PREFIX)).toBe(true)
      expect(isProjectOp(op)).toBe(true)
    })

    await it('send → apply replaces the whole record, keeping disabled entries', async () => {
      // `enabled: false` is dormancy, not deletion — the record is what
      // remembers a system was switched off rather than never known.
      const data = projectData([])
      data.gameSystems = { 'combat-action': { enabled: true } }
      const op = createGameSystemsSetOp({
        peerId: 'p1',
        seq: 2,
        gameSystems: { 'combat-action': { enabled: false, config: { pace: 2 } } },
      })
      applyGameSystemsSet(data, op.payload.gameSystems)
      expect(data.gameSystems).toStrictEqual({ 'combat-action': { enabled: false, config: { pace: 2 } } })
    })

    await it('is idempotent — applying twice equals applying once', async () => {
      const data = projectData([])
      const op = createGameSystemsSetOp({ peerId: 'p1', seq: 3, gameSystems: { economy: { enabled: true } } })
      applyGameSystemsSet(data, op.payload.gameSystems)
      const once = { ...data.gameSystems }
      applyGameSystemsSet(data, op.payload.gameSystems)
      expect(data.gameSystems).toStrictEqual(once)
    })
  })

  await describe('credits.set', async () => {
    const credit = { id: 'c1', role: 'art' as const, name: 'Tiles', license: 'CC0', url: 'https://example.org' }

    await it('builds a project op recognised by isProjectOp', async () => {
      const op = createCreditsSetOp({ peerId: 'p1', seq: 1, credits: [credit] })
      expect(op.kind).toBe(CREDITS_SET_KIND)
      expect(op.kind).toBe('__project/credits.set')
      expect(isProjectOp(op)).toBe(true)
    })

    await it('send → apply replaces the whole list, survives a JSON wire round-trip', async () => {
      const data = projectData([])
      data.credits = [{ id: 'old', role: 'code', name: 'Old' }]
      const op = createCreditsSetOp({ peerId: 'p1', seq: 2, credits: [credit] })
      const wire = JSON.parse(JSON.stringify(op)) as typeof op
      applyCreditsSet(data, wire.payload.credits)
      expect(data.credits).toStrictEqual([credit])
    })

    await it('is idempotent — applying twice equals applying once', async () => {
      const data = projectData([])
      applyCreditsSet(data, [credit])
      const once = structuredClone(data.credits)
      applyCreditsSet(data, [credit])
      expect(data.credits).toStrictEqual(once)
    })

    await it('stores only the known fields — extra peer keys are not kept', async () => {
      const data = projectData([])
      applyCreditsSet(data, [{ ...credit, evil: 'x', __proto_x: 1 }])
      expect(data.credits).toStrictEqual([credit])
      expect(Object.keys(data.credits?.[0] ?? {}).sort()).toStrictEqual(['id', 'license', 'name', 'role', 'url'])
    })

    await it('an empty list clears the credits', async () => {
      const data = projectData([])
      applyCreditsSet(data, [credit])
      applyCreditsSet(data, [])
      expect(data.credits).toStrictEqual([])
    })

    await it('drops invalid peer entries instead of trusting them', async () => {
      const data = projectData([])
      applyCreditsSet(data, [
        credit,
        { ...credit, id: 'bad-url', url: 'javascript:alert(1)' },
        { ...credit, id: 'bad-role', role: 'painter' },
        credit,
        'garbage',
      ])
      expect(data.credits).toStrictEqual([credit])
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

  await describe('map.spritesets.set', async () => {
    const ref = (id: string, firstGid: number) => ({
      id,
      path: `./spritesets/${id}.json`,
      type: 'spriteset' as const,
      firstGid,
    })
    const bare = (id: string) =>
      ({
        id,
        name: id,
        version: '1.0.0',
        tileWidth: 16,
        tileHeight: 16,
        columns: 4,
        rows: 4,
        layers: [],
      }) as unknown as MapData

    await it('builds a project op with the locked wire string', async () => {
      const op = createMapSpriteSetsSetOp({ peerId: 'p1', seq: 1, mapId: 'm', spriteSets: [ref('a', 1)] })
      expect(op.kind).toBe(MAP_SPRITESETS_SET_KIND)
      expect(op.kind).toBe('__project/map.spritesets.set')
      expect(isProjectOp(op)).toBe(true)
    })

    await it('send → apply replaces the list on the right map only', async () => {
      const a = bare('a')
      const b = bare('b')
      const op = createMapSpriteSetsSetOp({ peerId: 'p1', seq: 2, mapId: 'b', spriteSets: [ref('x', 1), ref('y', 65)] })
      expect(applyMapSpriteSetsSet([a, b], op.payload)).toBe(b)
      expect(b.spriteSets?.map((r) => r.id)).toStrictEqual(['x', 'y'])
      expect(a.spriteSets).toBeUndefined()
    })

    await it('is idempotent and drops malformed or duplicate entries', async () => {
      const m = bare('m')
      const payload = {
        mapId: 'm',
        spriteSets: [ref('x', 1), ref('x', 9), { id: 3 }, null, { ...ref('z', 1), firstGid: Number.NaN }],
      }
      applyMapSpriteSetsSet([m], payload)
      const once = JSON.stringify(m.spriteSets)
      applyMapSpriteSetsSet([m], payload)
      expect(JSON.stringify(m.spriteSets)).toBe(once)
      expect(m.spriteSets?.map((r) => r.id)).toStrictEqual(['x'])
      expect(m.spriteSets?.[0].firstGid).toBe(1)
    })

    await it('drops refs with an unsafe path or an id that is not one safe segment', async () => {
      const m = bare('m')
      const bad = [
        { ...ref('a', 1), path: '../x.json' },
        { ...ref('b', 1), path: '/etc/x.json' },
        { ...ref('c', 1), path: 'C:\\x.json' },
        ref('d/e', 1),
        ref('..', 1),
        ref('ok', 1),
      ]
      applyMapSpriteSetsSet([m], { mapId: 'm', spriteSets: bad })
      expect(m.spriteSets?.map((r) => r.id)).toStrictEqual(['ok'])
    })

    await it('ignores an op for a map this peer lacks', async () => {
      expect(applyMapSpriteSetsSet([bare('m')], { mapId: 'nope', spriteSets: [] })).toBeNull()
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

  await describe('map ops', async () => {
    function mapRef(id: string): MapReference {
      return { id, path: `./maps/${id}.json`, type: 'map', name: id }
    }
    function dataWithMaps(ids: string[], initialMapId = ids[0] ?? 'none'): GameProjectData {
      return {
        id: 'p',
        name: 'P',
        version: '1',
        spriteSets: [],
        maps: ids.map(mapRef),
        startup: { initialMapId },
      } as unknown as GameProjectData
    }

    await it('exposes the four kinds under the project prefix', async () => {
      // Lock the literal wire strings — a peer matches on them.
      expect(MAP_CREATE_CHUNK_KIND).toBe('__project/map.create.chunk')
      expect(MAP_RENAME_KIND).toBe('__project/map.rename')
      expect(MAP_REMOVE_KIND).toBe('__project/map.remove')
      expect(STARTUP_SET_KIND).toBe('__project/startup.set')
      for (const kind of [MAP_CREATE_CHUNK_KIND, MAP_RENAME_KIND, MAP_REMOVE_KIND, STARTUP_SET_KIND]) {
        expect(kind.startsWith(PROJECT_OP_PREFIX)).toBe(true)
        expect(isProjectOp({ kind, payload: {}, peerId: 'a', seq: 0 })).toBe(true)
      }
    })

    await it('builds typed rename / remove / startup envelopes', async () => {
      const rn = createMapRenameOp({ peerId: 'p1', seq: 1, mapId: 'cave', name: 'Deep Cave' })
      expect(rn.kind).toBe(MAP_RENAME_KIND)
      expect(rn.payload).toStrictEqual({ mapId: 'cave', name: 'Deep Cave' })
      expect(isProjectOp(rn)).toBe(true)

      const rm = createMapRemoveOp({ peerId: 'p1', seq: 2, mapId: 'cave' })
      expect(rm.kind).toBe(MAP_REMOVE_KIND)
      expect(rm.payload).toStrictEqual({ mapId: 'cave' })
      expect(isProjectOp(rm)).toBe(true)

      const st = createStartupSetOp({ peerId: 'p1', seq: 3, initialMapId: 'cave' })
      expect(st.kind).toBe(STARTUP_SET_KIND)
      expect(st.payload).toStrictEqual({ initialMapId: 'cave' })
      expect(isProjectOp(st)).toBe(true)
    })

    await it('round-trips a whole map through chunkMapCreate + the reassembler', async () => {
      // A real map's layers dwarf the 16 KiB chunk budget; force >1 chunk
      // so the map path exercises the same reassembly as a sprite-set add.
      const mapData = {
        id: 'cave',
        name: 'Cave',
        version: '1.0.0',
        tileWidth: 16,
        tileHeight: 16,
        columns: 80,
        rows: 60,
        spriteSets: [],
        layers: [{ id: 'layer_0', name: 'Background', visible: true, sprites: new Array(20_000).fill(0) }],
      } as unknown as MapData
      const payload: MapCreatePayload = { reference: mapRef('cave'), mapData }
      const chunks = chunkMapCreate({ transferId: 'host:9', payload })
      expect(chunks.length).toBeGreaterThan(1)
      expect(chunks.every((c) => c.kind === MAP_CREATE_CHUNK_KIND)).toBe(true)

      const re = new MapCreateReassembler()
      let result: MapCreatePayload | null = null
      // Feed reversed: only the completing chunk yields a payload.
      const stamped = chunks.map((c, i) => ({ ...c, peerId: 'host', seq: i }) as MapCreateChunkOp)
      for (const op of [...stamped].reverse()) result = re.accept(op) ?? result
      expect(result?.reference.id).toBe('cave')
      expect(result?.mapData.columns).toBe(80)
      expect(result?.mapData.layers[0]?.sprites?.length).toBe(20_000)
    })

    await it('applyMapCreate appends, replaces by id and keeps the start map resolvable', async () => {
      const data = dataWithMaps(['forest'])
      applyMapCreate(data, mapRef('cave'))
      expect(data.maps.map((m) => m.id)).toStrictEqual(['forest', 'cave'])
      expect(data.startup.initialMapId).toBe('forest')

      // Re-applying the same transfer must not duplicate the reference.
      applyMapCreate(data, { ...mapRef('cave'), name: 'Deep Cave' })
      expect(data.maps.map((m) => m.id)).toStrictEqual(['forest', 'cave'])
      expect(data.maps[1].name).toBe('Deep Cave')

      // The first map of an empty project becomes the start map, because
      // a project whose initialMapId does not resolve fails validation.
      const empty = dataWithMaps([], 'nothing')
      applyMapCreate(empty, mapRef('first'))
      expect(empty.startup.initialMapId).toBe('first')
    })

    await it('applyMapRename renames the reference and the loaded map', async () => {
      const data = dataWithMaps(['forest', 'cave'])
      const loaded = [{ id: 'cave', name: 'Cave' } as MapData]
      const renamed = applyMapRename(data, loaded, { mapId: 'cave', name: 'Deep Cave' })
      expect(renamed?.name).toBe('Deep Cave')
      expect(data.maps[1].name).toBe('Deep Cave')

      // A map that is not loaded still gets its reference renamed.
      const refOnly = applyMapRename(data, loaded, { mapId: 'forest', name: 'Woods' })
      expect(refOnly).toBe(null)
      expect(data.maps[0].name).toBe('Woods')
    })

    await it('applyMapRemove drops the reference and repoints the start map', async () => {
      const data = dataWithMaps(['forest', 'cave'], 'forest')
      const removed = applyMapRemove(data, 'forest')
      expect(removed?.path).toBe('./maps/forest.json')
      expect(data.maps.map((m) => m.id)).toStrictEqual(['cave'])
      // The start map went away, so it moves to the first survivor.
      expect(data.startup.initialMapId).toBe('cave')
      // Re-removing + removing an unknown id are both no-ops.
      expect(applyMapRemove(data, 'forest')).toBe(null)
      expect(applyMapRemove(data, 'zzz')).toBe(null)
      expect(data.maps.map((m) => m.id)).toStrictEqual(['cave'])
    })

    await it('applyStartupSet only accepts a map the receiver has', async () => {
      const data = dataWithMaps(['forest', 'cave'], 'forest')
      expect(applyStartupSet(data, 'cave')).toBe(true)
      expect(data.startup.initialMapId).toBe('cave')
      // An unknown map would make the project unsaveable on this peer.
      expect(applyStartupSet(data, 'nowhere')).toBe(false)
      expect(data.startup.initialMapId).toBe('cave')
    })
  })
}
