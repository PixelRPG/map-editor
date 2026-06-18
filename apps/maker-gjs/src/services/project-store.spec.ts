import GLib from '@girs/glib-2.0'
import { describe, expect, it } from '@gjsify/unit'
import {
  createEntityRemoveOp,
  createEntityUpsertOp,
  createPlayerSetOp,
  ENTITY_REMOVE_KIND,
  ENTITY_UPSERT_KIND,
  type EntityDefinition,
  type GameProjectData,
  GameProjectFormat,
  PLAYER_SET_KIND,
  PROJECT_META_UPDATE_KIND,
  type ProjectOp,
  type SpriteSetAddPayload,
  type SpriteSetUpdatePayload,
} from '@pixelrpg/engine'

import type { LoadedProject } from './project-loader.ts'
import {
  type EntityLibraryChangeSource,
  ProjectStore,
  type ProjectStoreIo,
  type ProjectSyncSession,
  uniqueIdFrom,
} from './project-store.ts'

/**
 * Minimal in-memory `GameProjectData` for store tests — shaped to pass
 * `GameProjectFormat.validate` (the store's persist path serialises
 * through it, so the fixture must be a legal project).
 */
function makeProjectData(overrides: Partial<GameProjectData> = {}): GameProjectData {
  return {
    version: '1',
    id: 'test-project',
    name: 'Test Project',
    startup: { initialMapId: 'map-1' },
    maps: [{ id: 'map-1', path: './maps/map-1.json', type: 'map' }],
    spriteSets: [],
    entityLibrary: [],
    ...overrides,
  }
}

/**
 * Fake `LoadedProject` over an in-memory resource — the store only
 * touches `resource.{path,data,spriteSets,maps}`, so a structural fake
 * is enough (no filesystem, no engine load).
 */
function makeProject(data: GameProjectData): LoadedProject {
  const resource = {
    path: '/tmp/project-store-spec/game-project.json',
    data,
    spriteSets: new Map(),
    maps: new Map(),
  }
  return {
    projectPath: resource.path,
    projectName: data.name,
    scenes: [],
    teleports: [],
    resource,
  } as unknown as LoadedProject
}

/** Recording file-IO fake — nothing touches the disk. */
function makeIo(): ProjectStoreIo & { writes: Array<{ path: string; contents: string }> } {
  const writes: Array<{ path: string; contents: string }> = []
  return {
    writes,
    writeText: (path: string, contents: string) => {
      writes.push({ path, contents })
      return true
    },
    writeBinary: () => true,
    copy: () => true,
    readBinary: () => null,
    remove: () => true,
  }
}

/** Recording collab-session fake satisfying {@link ProjectSyncSession}. */
function makeSession(): ProjectSyncSession & { sent: ProjectOp[] } {
  const sent: ProjectOp[] = []
  return {
    sent,
    sendProjectOp(build) {
      sent.push(build({ peerId: 'local-peer', seq: sent.length }))
    },
    sendSpriteSetAdd(_payload: SpriteSetAddPayload) {},
    sendSpriteSetUpdate(_payload: SpriteSetUpdatePayload) {},
    onProjectOpReceived: null,
    onSpriteSetAddReceived: null,
    onSpriteSetUpdateReceived: null,
  }
}

function makeStore(data = makeProjectData()) {
  const io = makeIo()
  const toasts: string[] = []
  const store = new ProjectStore(io)
  store.on('notice', (n) => toasts.push(n.kind))
  store.setProject(makeProject(data))
  return { store, io, toasts, data }
}

const npc: EntityDefinition = { id: 'npc-1', name: 'NPC', components: [] }

export default async () => {
  await describe('uniqueIdFrom', async () => {
    await it('slugs the name and skips taken ids', async () => {
      expect(uniqueIdFrom('Hero', new Set())).toBe('hero')
      expect(uniqueIdFrom('Hero Two!', new Set())).toBe('hero-two')
      expect(uniqueIdFrom('Hero', new Set(['hero']))).toBe('hero-2')
      expect(uniqueIdFrom('Hero', new Set(['hero', 'hero-2', 'hero-3']))).toBe('hero-4')
    })

    await it('falls back when the name slugs to nothing', async () => {
      expect(uniqueIdFrom('!!!', new Set())).toBe('item')
      expect(uniqueIdFrom(' ', new Set(['object']), 'object')).toBe('object-2')
      expect(uniqueIdFrom('', new Set(['item', 'item-2']))).toBe('item-3')
    })
  })

  await describe('ProjectStore — entity library writes', async () => {
    await it('upsertEntity appends, persists and notifies with the source', async () => {
      const { store, io, data } = makeStore()
      const sources: EntityLibraryChangeSource[] = []
      store.on('entity-library-changed', ({ source }) => sources.push(source))

      store.upsertEntity(npc, 'objects')

      expect(data.entityLibrary).toHaveLength(1)
      expect(data.entityLibrary?.[0]?.id).toBe('npc-1')
      // Persisted the project JSON to the resource path with the entity inside.
      expect(io.writes).toHaveLength(1)
      expect(io.writes[0].path).toBe('/tmp/project-store-spec/game-project.json')
      expect(GameProjectFormat.deserialize(io.writes[0].contents).entityLibrary?.[0]?.id).toBe('npc-1')
      expect(sources).toStrictEqual(['objects'])
    })

    await it('upsertEntity replaces by id (no duplicates)', async () => {
      const { store, data } = makeStore()
      store.upsertEntity(npc, 'cast')
      store.upsertEntity({ ...npc, name: 'Renamed' }, 'cast')
      expect(data.entityLibrary).toHaveLength(1)
      expect(data.entityLibrary?.[0]?.name).toBe('Renamed')
    })

    await it('upsertEntity broadcasts an entity.upsert while a session is attached', async () => {
      const { store } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)

      store.upsertEntity(npc, 'cast')

      expect(session.sent).toHaveLength(1)
      expect(session.sent[0].kind).toBe(ENTITY_UPSERT_KIND)
      expect(session.sent[0].peerId).toBe('local-peer')
    })

    await it('upsertEntity persists without broadcasting in solo editing', async () => {
      const { store, io } = makeStore()
      store.upsertEntity(npc, 'cast')
      expect(io.writes).toHaveLength(1)
    })

    await it('removeEntity drops the entity, clears the player flag and broadcasts entity.remove', async () => {
      const { store, data } = makeStore(makeProjectData({ entityLibrary: [{ ...npc }], playerActorId: 'npc-1' }))
      const session = makeSession()
      store.setCollabSession(session)

      expect(store.removeEntity('npc-1', 'cast')).toBe(true)

      expect(data.entityLibrary).toHaveLength(0)
      expect(data.playerActorId).toBe(undefined)
      expect(session.sent).toHaveLength(1)
      expect(session.sent[0].kind).toBe(ENTITY_REMOVE_KIND)
    })

    await it('removeEntity is a guarded no-op for an unknown id (no persist, no broadcast, no event)', async () => {
      const { store, io } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)
      let events = 0
      store.on('entity-library-changed', () => events++)

      expect(store.removeEntity('ghost', 'objects')).toBe(false)

      expect(io.writes).toHaveLength(0)
      expect(session.sent).toHaveLength(0)
      expect(events).toBe(0)
    })

    await it('setPlayerActor writes playerActorId and broadcasts player.set (null clears)', async () => {
      const { store, data } = makeStore(makeProjectData({ entityLibrary: [{ ...npc }] }))
      const session = makeSession()
      store.setCollabSession(session)

      store.setPlayerActor('npc-1', 'cast')
      expect(data.playerActorId).toBe('npc-1')
      store.setPlayerActor(null, 'cast')
      expect(data.playerActorId).toBe(undefined)

      expect(session.sent.map((op) => op.kind)).toStrictEqual([PLAYER_SET_KIND, PLAYER_SET_KIND])
    })

    await it('commitProjectMeta persists and broadcasts the whole name + properties bag', async () => {
      const { store, io, data } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)
      data.name = 'Renamed Project'
      data.properties = { author: 'someone' }

      store.commitProjectMeta()

      expect(io.writes).toHaveLength(1)
      expect(session.sent).toHaveLength(1)
      const op = session.sent[0]
      expect(op.kind).toBe(PROJECT_META_UPDATE_KIND)
      if (op.kind === PROJECT_META_UPDATE_KIND) {
        expect(op.payload.name).toBe('Renamed Project')
        expect(op.payload.properties.author).toBe('someone')
      }
    })

    await it('mutations without a project are no-ops', async () => {
      const io = makeIo()
      const store = new ProjectStore(io)
      store.upsertEntity(npc, 'cast')
      store.setPlayerActor('npc-1', 'cast')
      expect(store.removeEntity('npc-1', 'cast')).toBe(false)
      expect(io.writes).toHaveLength(0)
    })
  })

  await describe('ProjectStore — remote-op application', async () => {
    const remoteUpsert = (entity: EntityDefinition) => createEntityUpsertOp({ peerId: 'peer-b', seq: 0, entity })

    await it('registers itself as the session sinks (single applier)', async () => {
      const { store, data } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)

      // The transport feeds inbound ops through the sink the store registered.
      session.onProjectOpReceived?.(remoteUpsert(npc))

      expect(data.entityLibrary).toHaveLength(1)
    })

    await it('defers sink registration until a project is present (joiner attach order)', async () => {
      // Joiner: setCollabSession runs (state-changed) BEFORE the sandbox
      // project finishes loading (setProject). Until a project is present
      // the store must NOT register the sinks, so the session keeps
      // buffering inbound ops instead of feeding a project-less applier.
      const io = makeIo()
      const store = new ProjectStore(io)
      const session = makeSession()

      store.setCollabSession(session)
      expect(session.onProjectOpReceived).toBe(null)

      // Project arrives → sinks register (which drains the session buffer).
      store.setProject(makeProject(makeProjectData()))
      expect(session.onProjectOpReceived).not.toBe(null)

      session.onProjectOpReceived?.(remoteUpsert(npc))
      expect(store.data?.entityLibrary).toHaveLength(1)
    })

    await it('applies entity.upsert idempotently and never re-broadcasts', async () => {
      const { store, io, data } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)
      const sources: EntityLibraryChangeSource[] = []
      store.on('entity-library-changed', ({ source }) => sources.push(source))

      const op = remoteUpsert(npc)
      store.applyRemoteProjectOp(op)
      store.applyRemoteProjectOp(op)

      expect(data.entityLibrary).toHaveLength(1)
      // Applying an inbound op must NOT loop back to peers…
      expect(session.sent).toHaveLength(0)
      // …but it persists locally and notifies the lenses as 'remote'.
      expect(io.writes).toHaveLength(2)
      expect(sources).toStrictEqual(['remote', 'remote'])
    })

    await it('applies entity.remove + player.set idempotently', async () => {
      const { store, data } = makeStore(makeProjectData({ entityLibrary: [{ ...npc }] }))

      store.applyRemoteProjectOp(createPlayerSetOp({ peerId: 'peer-b', seq: 0, playerActorId: 'npc-1' }))
      expect(data.playerActorId).toBe('npc-1')

      const remove = createEntityRemoveOp({ peerId: 'peer-b', seq: 1, entityId: 'npc-1' })
      store.applyRemoteProjectOp(remove)
      store.applyRemoteProjectOp(remove)

      expect(data.entityLibrary).toHaveLength(0)
      expect(data.playerActorId).toBe(undefined)
    })

    await it('emits project-meta-changed for an inbound meta.update', async () => {
      const { store, data } = makeStore()
      let metaEvents = 0
      store.on('project-meta-changed', () => metaEvents++)

      store.applyRemoteProjectOp({
        kind: PROJECT_META_UPDATE_KIND,
        payload: { name: 'Peer Name', properties: { author: 'peer' } },
        peerId: 'peer-b',
        seq: 0,
      })

      expect(data.name).toBe('Peer Name')
      expect(data.properties?.author).toBe('peer')
      expect(metaEvents).toBe(1)
    })

    await it('ignores ops while no project is open', async () => {
      const io = makeIo()
      const store = new ProjectStore(io)
      store.applyRemoteProjectOp(remoteUpsert(npc))
      expect(io.writes).toHaveLength(0)
    })
  })

  await describe('ProjectStore — applyRemoteSpriteSetAdd idempotency', async () => {
    const makeSpriteSetData = (id: string, spriteCount: number) =>
      ({
        version: '1.0.0',
        id,
        name: id,
        image: { id: 'main', path: `${id}.png`, type: 'image' },
        spriteWidth: 16,
        spriteHeight: 16,
        columns: spriteCount,
        rows: 1,
        margin: 0,
        spacing: 0,
        sprites: Array.from({ length: spriteCount }, (_, i) => ({ id: i, col: i, row: 0 })),
      }) as unknown as SpriteSetAddPayload['data']

    await it('reuses an existing firstGid on re-apply (idempotent gid space)', async () => {
      // applyRemoteSpriteSetAdd uses GLib path helpers — only real under the
      // GJS target. Skip gracefully on node where gi:// is stubbed.
      if (typeof (GLib as { path_get_dirname?: unknown }).path_get_dirname !== 'function') return
      const { store, data } = makeStore()
      const payload: SpriteSetAddPayload = { data: makeSpriteSetData('imported', 3), imageBase64: '' }

      store.applyRemoteSpriteSetAdd(payload)
      const firstGid1 = data.spriteSets.find((r) => r.id === 'imported')?.firstGid
      expect(firstGid1).toBe(1)

      // Simulate the async live-load completing: the set now reports 3 sprites,
      // so a naive _nextFirstGid would count this set and shift its gid on the
      // next apply.
      store.resource?.spriteSets.set('imported', { data: { sprites: [{}, {}, {}] } } as never)

      store.applyRemoteSpriteSetAdd(payload)
      const firstGid2 = data.spriteSets.find((r) => r.id === 'imported')?.firstGid
      expect(firstGid2).toBe(firstGid1) // unchanged — re-apply is idempotent
    })
  })
}
