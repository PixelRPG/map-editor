import GLib from '@girs/glib-2.0'
import { describe, expect, it } from '@gjsify/unit'
import {
  createLanguagesSetOp,
  CREDITS_SET_KIND,
  createFlagRemoveOp,
  createFlagUpsertOp,
  FLAG_REMOVE_KIND,
  FLAG_UPSERT_KIND,
  LANGUAGES_SET_KIND,
  createCreditsSetOp,
  createEntityRemoveOp,
  createEntityUpsertOp,
  createGameSystemsSetOp,
  createMapRemoveOp,
  createMapRenameOp,
  createPlayerSetOp,
  createStartupSetOp,
  ENTITY_REMOVE_KIND,
  ENTITY_UPSERT_KIND,
  type EntityDefinition,
  GAME_SYSTEMS_SET_KIND,
  type GameProjectData,
  GameProjectFormat,
  MAP_REMOVE_KIND,
  MAP_RENAME_KIND,
  type MapCreatePayload,
  type MapData,
  MapFormat,
  PLAYER_SET_KIND,
  PROJECT_META_UPDATE_KIND,
  type ProjectOp,
  type SpriteSetAddPayload,
  type SpriteSetData,
  type SpriteSetUpdatePayload,
  STARTUP_SET_KIND,
} from '@pixelrpg/engine'

import { applyAnimationEdit, removeAnimation } from './cast-controller-animations.ts'
import type { LoadedProject } from './project-loader.ts'
import { MAP_SIZE_PRESETS } from './project-store-maps.ts'
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
function makeProject(data: GameProjectData, maps: MapData[] = []): LoadedProject {
  const resource = {
    path: '/tmp/project-store-spec/game-project.json',
    data,
    spriteSets: new Map(),
    maps: new Map(maps.map((mapData) => [mapData.id, { mapData }])),
  }
  return {
    projectPath: resource.path,
    projectName: data.name,
    scenes: [],
    teleports: [],
    resource,
  } as unknown as LoadedProject
}

/**
 * Recording file-IO fake — nothing touches the disk.
 *
 * `behaviour` models the three ways a persist ends: it lands (`ok`), the
 * write reports failure (`fail`), or the write/serialise raises
 * (`throw`). The last one is the shape that used to escape `ProjectStore`
 * entirely on the inbound-peer path.
 */
function makeIo(
  behaviour: 'ok' | 'fail' | 'throw' = 'ok',
): ProjectStoreIo & { writes: Array<{ path: string; contents: string }>; removes: string[] } {
  const writes: Array<{ path: string; contents: string }> = []
  const removes: string[] = []
  return {
    writes,
    removes,
    writeText: (path: string, contents: string) => {
      if (behaviour === 'throw') throw new Error('disk on fire')
      writes.push({ path, contents })
      return behaviour === 'ok'
    },
    writeBinary: () => behaviour === 'ok',
    copy: () => behaviour === 'ok',
    readBinary: () => null,
    remove: (path: string) => {
      removes.push(path)
      return behaviour === 'ok'
    },
  }
}

/** Recording collab-session fake satisfying {@link ProjectSyncSession}. */
function makeSession(): ProjectSyncSession & {
  sent: ProjectOp[]
  sentSpriteSets: SpriteSetUpdatePayload[]
  sentMaps: MapCreatePayload[]
} {
  const sent: ProjectOp[] = []
  const sentSpriteSets: SpriteSetUpdatePayload[] = []
  const sentMaps: MapCreatePayload[] = []
  return {
    sent,
    sentSpriteSets,
    sentMaps,
    sendProjectOp(build) {
      sent.push(build({ peerId: 'local-peer', seq: sent.length }))
    },
    sendSpriteSetAdd(_payload: SpriteSetAddPayload) {},
    sendSpriteSetUpdate(payload: SpriteSetUpdatePayload) {
      sentSpriteSets.push(payload)
    },
    sendMapCreate(payload: MapCreatePayload) {
      sentMaps.push(payload)
    },
    onProjectOpReceived: null,
    onSpriteSetAddReceived: null,
    onSpriteSetUpdateReceived: null,
    onMapCreateReceived: null,
  }
}

function makeStore(data = makeProjectData(), behaviour: 'ok' | 'fail' | 'throw' = 'ok', maps: MapData[] = []) {
  const io = makeIo(behaviour)
  const toasts: string[] = []
  const store = new ProjectStore(io)
  store.on('notice', (n) => toasts.push(n.kind))
  store.setProject(makeProject(data, maps))
  return { store, io, toasts, data }
}

const npc: EntityDefinition = { id: 'npc-1', name: 'NPC', components: [] }

/** In-memory map data shaped to pass `MapFormat.validate`. */
function makeMapData(id: string, name: string, overrides: Partial<MapData> = {}): MapData {
  return {
    id,
    name,
    version: '1.0.0',
    tileWidth: 16,
    tileHeight: 16,
    columns: 20,
    rows: 14,
    spriteSets: [],
    layers: [{ id: 'layer_0', name: 'Background', visible: true, sprites: [] }],
    ...overrides,
  } as MapData
}

/** A door placement with an inline teleport definition into `targetMapId`. */
function doorInto(targetMapId: string, tileX = 1): MapData['objectPlacements'] {
  return [
    {
      id: `door-${targetMapId}-${tileX}`,
      tileX,
      tileY: 1,
      inline: {
        id: `door-${targetMapId}`,
        name: 'Door',
        components: [{ type: 'teleport', targetMapId, targetTileX: 0, targetTileY: 0 }],
      },
    },
  ] as MapData['objectPlacements']
}

/** GLib path helpers are only real under the GJS target; node stubs `gi://`. */
const hasGLibPaths = typeof (GLib as { path_get_dirname?: unknown }).path_get_dirname === 'function'

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

  await describe('ProjectStore — game systems', async () => {
    await it('switching a system on persists, broadcasts systems.set and notifies', async () => {
      const { store, io, data } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)
      let notified = 0
      store.on('game-systems-changed', () => notified++)

      store.setGameSystemEnabled('combat-action', true)

      // Enabling pulls in what the system declares it reads, so the record
      // that lands on disk and on the wire is already closed over
      // `requires` — a peer never has to re-derive it.
      expect(data.gameSystems).toStrictEqual({
        'combat-action': { enabled: true },
        stats: { enabled: true },
        inventory: { enabled: true },
      })
      expect(io.writes).toHaveLength(1)
      expect(GameProjectFormat.deserialize(io.writes[0].contents).gameSystems?.['combat-action']).toStrictEqual({
        enabled: true,
      })
      expect(session.sent).toHaveLength(1)
      expect(session.sent[0].kind).toBe(GAME_SYSTEMS_SET_KIND)
      expect(notified).toBe(1)
    })

    await it('round-trips an id this build does not know', async () => {
      // A project saved by a newer editor must open here, keep the system
      // it names, and save it back — otherwise opening a file downgrades it.
      const { store, io, data } = makeStore()
      store.setGameSystemEnabled('combat-turn', true)
      expect(data.gameSystems).toStrictEqual({ 'combat-turn': { enabled: true } })
      expect(GameProjectFormat.deserialize(io.writes[0].contents).gameSystems).toStrictEqual({
        'combat-turn': { enabled: true },
      })
    })

    await it('switching off is dormant, never destructive', async () => {
      // The line this whole design turns on: disabled data is preserved
      // and inert. Nothing about the library or the entry is removed.
      const { store, data } = makeStore(makeProjectData({ entityLibrary: [{ ...npc }] }))
      store.setGameSystemEnabled('combat-action', true)
      store.setGameSystemEnabled('combat-action', false)

      expect(data.gameSystems?.['combat-action']).toStrictEqual({ enabled: false })
      // What it pulled in stays on: turning fighting off must not take the
      // hit points with it, because other things may already read them.
      expect(data.gameSystems?.stats).toStrictEqual({ enabled: true })
      expect(data.entityLibrary).toHaveLength(1)
    })

    await it('componentRegistry follows the enabled set', async () => {
      const { store } = makeStore()
      const base = Object.keys(store.componentRegistry())
      // Base systems ship on: `item` is inventory's, `stats` is stats'.
      expect(base).toContain('item')
      expect(base).toContain('stats')
      // …and a switchable system's components are absent until it is on.
      expect(base).not.toContain('weapon')

      store.setGameSystemEnabled('combat-action', true)
      const on = Object.keys(store.componentRegistry())
      expect(on).toContain('weapon')
      expect(on).toContain('hostile')

      store.setGameSystemEnabled('combat-action', false)
      expect(Object.keys(store.componentRegistry())).not.toContain('weapon')
    })

    await it('an unknown id never adds to the registry', async () => {
      const { store } = makeStore()
      const base = Object.keys(store.componentRegistry()).sort()
      store.setGameSystemEnabled('combat-turn', true)
      expect(Object.keys(store.componentRegistry()).sort()).toStrictEqual(base)
    })

    await it('applies a remote systems.set without re-broadcasting', async () => {
      const { store, data } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)
      let notified = 0
      store.on('game-systems-changed', () => notified++)

      const op = createGameSystemsSetOp({ peerId: 'peer-b', seq: 0, gameSystems: { economy: { enabled: true } } })
      store.applyRemoteProjectOp(op)
      store.applyRemoteProjectOp(op)

      expect(data.gameSystems).toStrictEqual({ economy: { enabled: true } })
      expect(session.sent).toHaveLength(0)
      expect(notified).toBe(2)
    })
  })

  await describe('ProjectStore — credits', async () => {
    const credit = { id: 'c1', role: 'art' as const, name: 'Tiles', url: 'https://example.org' }

    await it('setCredits persists, broadcasts credits.set and notifies', async () => {
      const { store, io, data } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)
      let notified = 0
      store.on('credits-changed', () => notified++)

      store.setCredits([credit])

      expect(data.credits).toStrictEqual([credit])
      expect(GameProjectFormat.deserialize(io.writes[0].contents).credits).toStrictEqual([credit])
      expect(session.sent).toHaveLength(1)
      expect(session.sent[0].kind).toBe(CREDITS_SET_KIND)
      expect(notified).toBe(1)
    })

    await it('applies a remote credits.set without re-broadcasting', async () => {
      const { store, data } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)
      const op = createCreditsSetOp({ peerId: 'peer-b', seq: 0, credits: [credit] })
      store.applyRemoteProjectOp(op)
      store.applyRemoteProjectOp(op)
      expect(data.credits).toStrictEqual([credit])
      expect(session.sent).toHaveLength(0)
    })
  })

  await describe('ProjectStore — languages', async () => {
    await it('defaults to English only, then setLanguages persists, broadcasts and notifies', async () => {
      const { store, io, data } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)
      let notified = 0
      store.on('languages-changed', () => notified++)
      expect(store.languages()).toStrictEqual({ default: 'en', others: [] })

      expect(store.setLanguages({ default: 'en', others: ['de'] })).toBe(true)

      expect(data.languages).toStrictEqual({ default: 'en', others: ['de'] })
      expect(GameProjectFormat.deserialize(io.writes[0].contents).languages).toStrictEqual({
        default: 'en',
        others: ['de'],
      })
      expect(session.sent[0].kind).toBe(LANGUAGES_SET_KIND)
      expect(notified).toBe(1)
    })

    await it('rejects a malformed local value without persisting or broadcasting', async () => {
      const { store, data } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)
      expect(store.setLanguages({ default: 'en', others: ['en'] })).toBe(false)
      expect(data.languages).toBe(undefined)
      expect(session.sent).toHaveLength(0)
    })

    await it('applies a remote languages.set without re-broadcasting, ignores a malformed one', async () => {
      const { store, data } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)
      store.applyRemoteProjectOp(
        createLanguagesSetOp({ peerId: 'peer-b', seq: 0, languages: { default: 'de', others: ['en'] } }),
      )
      expect(data.languages).toStrictEqual({ default: 'de', others: ['en'] })
      const bad = createLanguagesSetOp({ peerId: 'peer-b', seq: 1, languages: { default: 'de', others: ['de'] } })
      store.applyRemoteProjectOp(bad)
      expect(data.languages).toStrictEqual({ default: 'de', others: ['en'] })
      expect(session.sent).toHaveLength(0)
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

    await it('ignores an unrecognised __project/* kind (forward compat)', async () => {
      const { store, io } = makeStore()
      let events = 0
      store.on('entity-library-changed', () => events++)

      store.applyRemoteProjectOp({
        kind: '__project/future.thing',
        payload: {},
        peerId: 'peer-b',
        seq: 0,
      } as unknown as ProjectOp)

      expect(io.writes).toHaveLength(0)
      expect(events).toBe(0)
    })
  })

  await describe('ProjectStore — sprite-set list', async () => {
    const refs = () => [
      { id: 'a', path: './spritesets/a.json', type: 'spriteset' as const, firstGid: 1 },
      { id: 'b', path: './spritesets/b.json', type: 'spriteset' as const, firstGid: 5 },
    ]

    await it('reorderSpriteSets rewrites the order, persists and notifies list-wide', async () => {
      const { store, io, data } = makeStore(makeProjectData({ spriteSets: refs() }))
      const session = makeSession()
      store.setCollabSession(session)
      const events: Array<{ spriteSetId?: string }> = []
      store.on('sprite-sets-changed', (e) => events.push(e))

      store.reorderSpriteSets(['b', 'a'])

      expect(data.spriteSets.map((r) => r.id)).toStrictEqual(['b', 'a'])
      expect(io.writes).toHaveLength(1)
      // No `spriteSetId`: the LIST changed, not a set.
      expect(events).toStrictEqual([{}])
      // Order is local + cosmetic — deliberately never broadcast.
      expect(session.sent).toHaveLength(0)
    })

    await it('reorderSpriteSets is a no-op when the order is already current', async () => {
      const { store, io } = makeStore(makeProjectData({ spriteSets: refs() }))
      let events = 0
      store.on('sprite-sets-changed', () => events++)

      store.reorderSpriteSets(['a', 'b'])

      expect(io.writes).toHaveLength(0)
      expect(events).toBe(0)
    })

    await it('mutateSpriteSetData reports false for an unknown set without writing', async () => {
      const { store, io } = makeStore()
      expect(store.mutateSpriteSetData('ghost', () => {})).toBe(false)
      expect(io.writes).toHaveLength(0)
    })
  })

  // ────────────────────────────────────────────────────────────
  // Sprite-set DESCRIPTOR writes (`spritesets/<id>.json`)
  //
  // These paths all go through the store's one write-then-commit step.
  // The invariant they share: a write that did not land changes NOTHING
  // observable — not the in-memory descriptor, not the collab wire, not
  // a change event. Add every new descriptor write path to
  // `descriptorWritePaths` below; that table is what makes a hand-rolled
  // persist in a new method visible instead of silently drifting.
  // ────────────────────────────────────────────────────────────

  const spriteSetData = (overrides: Partial<Record<string, unknown>> = {}) =>
    ({
      version: '1.0.0',
      id: 'tiles',
      name: 'Tiles',
      image: { id: 'main', type: 'image', path: 'tiles.png' },
      spriteWidth: 16,
      spriteHeight: 16,
      columns: 2,
      rows: 1,
      sprites: [
        { id: 0, col: 0, row: 0 },
        { id: 1, col: 1, row: 0 },
      ],
      characterAnimations: [{ id: 'idle-down', frames: [{ spriteId: 0, duration: 200 }] }],
      ...overrides,
    }) as unknown as SpriteSetData

  /**
   * A store with one live sprite set registered. Descriptor paths build
   * filesystem paths through GLib, which is only real under the GJS
   * target — callers skip on node (`hasGLibPaths`).
   */
  function makeStoreWithSpriteSet(behaviour: 'ok' | 'fail' | 'throw' = 'ok') {
    const { store, io, toasts } = makeStore(makeProjectData(), behaviour)
    const engineSet = { data: spriteSetData(), path: '/tmp/project-store-spec/spritesets/tiles.json' }
    store.resource?.spriteSets.set('tiles', engineSet as never)
    const session = makeSession()
    store.setCollabSession(session)
    const events: string[] = []
    for (const name of ['sprite-sets-changed', 'tile-properties-changed', 'terrains-changed'] as const) {
      store.on(name, () => events.push(name))
    }
    return { store, io, toasts, session, events, engineSet }
  }

  /** Every write path that persists `spritesets/<id>.json`. Keep in sync with `ProjectStore`. */
  const descriptorWritePaths: Array<[string, (store: ProjectStore) => void]> = [
    ['renameSpriteSet', (store) => store.renameSpriteSet('tiles', 'Renamed')],
    ['setTileCollision', (store) => store.setTileCollision('tiles', 1, 'half-top')],
    ['setTileCollisions', (store) => store.setTileCollisions('tiles', [0, 1], 'wall')],
    ['setTileSurface', (store) => store.setTileSurface('tiles', 1, 'water')],
    ['setTerrain', (store) => void store.setTerrain('tiles', { id: 'path', name: 'Path', tiles: { '255': 1 } })],
    [
      'mutateSpriteSetData',
      (store) =>
        void store.mutateSpriteSetData('tiles', (draft) => {
          draft.name = 'Mutated'
        }),
    ],
    [
      'applyRemoteSpriteSetUpdate',
      (store) => store.applyRemoteSpriteSetUpdate({ data: spriteSetData({ name: 'Peer' }) } as SpriteSetUpdatePayload),
    ],
  ]

  await describe('ProjectStore — sprite-set descriptor writes', async () => {
    for (const [label, run] of descriptorWritePaths) {
      await it(`${label} commits nothing when the write reports failure`, async () => {
        if (!hasGLibPaths) return
        const { store, session, events, engineSet, toasts } = makeStoreWithSpriteSet('fail')
        const before = JSON.stringify(engineSet.data)

        run(store)

        expect(JSON.stringify(engineSet.data)).toBe(before)
        expect(session.sentSpriteSets).toHaveLength(0)
        expect(events).toHaveLength(0)
        expect(toasts).toStrictEqual(['sprite-set-save-failed'])
      })

      await it(`${label} commits nothing (and does not throw) when the write raises`, async () => {
        if (!hasGLibPaths) return
        const { store, session, events, engineSet } = makeStoreWithSpriteSet('throw')
        const before = JSON.stringify(engineSet.data)

        run(store)

        expect(JSON.stringify(engineSet.data)).toBe(before)
        expect(session.sentSpriteSets).toHaveLength(0)
        expect(events).toHaveLength(0)
      })
    }

    await it('applyRemoteSpriteSetUpdate keeps the local descriptor when the peer chunk fails to serialise', async () => {
      if (!hasGLibPaths) return
      // The exact reachable-from-the-network case: a peer sends a
      // descriptor `SpriteSetFormat.serialize` rejects. Before the guard
      // the throw escaped the store — after `engineSet.data` had already
      // been replaced and before any change event was emitted.
      const { store, engineSet, events } = makeStoreWithSpriteSet()
      const invalid = spriteSetData({ version: '' })

      store.applyRemoteSpriteSetUpdate({ data: invalid } as SpriteSetUpdatePayload)

      expect(engineSet.data.version).toBe('1.0.0')
      expect(engineSet.data.name).toBe('Tiles')
      expect(events).toHaveLength(0)
    })

    await it('applyRemoteSpriteSetUpdate replaces the descriptor and notifies on a good chunk', async () => {
      if (!hasGLibPaths) return
      const { store, engineSet, events, io } = makeStoreWithSpriteSet()

      store.applyRemoteSpriteSetUpdate({ data: spriteSetData({ name: 'Peer' }) } as SpriteSetUpdatePayload)

      expect(engineSet.data.name).toBe('Peer')
      expect(io.writes).toHaveLength(1)
      expect(events).toStrictEqual(['tile-properties-changed', 'terrains-changed', 'sprite-sets-changed'])
    })

    await it('setTileCollisions writes every tile in ONE persist and ONE broadcast', async () => {
      if (!hasGLibPaths) return
      // The Wall brush's whole reason to exist: a stroke across a
      // 1024-tile set must not cost one file write and one peer op per
      // tile it crossed.
      const { store, io, session, engineSet, events } = makeStoreWithSpriteSet()

      store.setTileCollisions('tiles', [0, 1], 'wall')

      expect(engineSet.data.sprites[0].solid).toBe(true)
      expect(engineSet.data.sprites[1].solid).toBe(true)
      expect(io.writes).toHaveLength(1)
      expect(session.sentSpriteSets).toHaveLength(1)
      expect(events).toStrictEqual(['tile-properties-changed'])
    })

    await it('setTileCollisions skips unknown ids but still writes the known ones', async () => {
      if (!hasGLibPaths) return
      // A stroke reports what the pointer crossed; a palette showing
      // fewer tiles than the stroke's ids is not an error.
      const { store, io, engineSet } = makeStoreWithSpriteSet()

      store.setTileCollisions('tiles', [1, 99], 'wall')

      expect(engineSet.data.sprites[1].solid).toBe(true)
      expect(engineSet.data.sprites[0].solid).toBeUndefined()
      expect(io.writes).toHaveLength(1)
    })

    await it('setTileCollisions does nothing for an empty stroke or an unwritable preset', async () => {
      if (!hasGLibPaths) return
      const { store, io, session, events } = makeStoreWithSpriteSet()

      store.setTileCollisions('tiles', [], 'wall')
      store.setTileCollisions('tiles', [0, 1], 'custom')
      store.setTileCollisions('tiles', [99], 'wall')

      expect(io.writes).toHaveLength(0)
      expect(session.sentSpriteSets).toHaveLength(0)
      expect(events).toHaveLength(0)
    })

    await it('a REJECTED mutateSpriteSetData persists nothing and broadcasts nothing', async () => {
      if (!hasGLibPaths) return
      // A rejected sheet edit (duplicate animation id, protected role,
      // unknown target) must not ship a full-sheet upsert: that would
      // clobber a peer's concurrent edit with our unchanged copy.
      const { store, io, session, engineSet } = makeStoreWithSpriteSet()
      const before = JSON.stringify(engineSet.data)

      const changed = store.mutateSpriteSetData('tiles', (draft) => {
        draft.name = 'Should be discarded'
        return false
      })

      expect(changed).toBe(false)
      expect(io.writes).toHaveLength(0)
      expect(session.sentSpriteSets).toHaveLength(0)
      expect(JSON.stringify(engineSet.data)).toBe(before)
    })

    await it('an ACCEPTED mutateSpriteSetData persists once and broadcasts once', async () => {
      if (!hasGLibPaths) return
      const { store, io, session, engineSet } = makeStoreWithSpriteSet()

      const changed = store.mutateSpriteSetData('tiles', (draft) => {
        draft.name = 'Mutated'
      })

      expect(changed).toBe(true)
      expect(engineSet.data.name).toBe('Mutated')
      expect(io.writes).toHaveLength(1)
      expect(session.sentSpriteSets).toHaveLength(1)
      expect(session.sentSpriteSets[0].data.name).toBe('Mutated')
    })

    await it('setTerrain appends a brush, then REPLACES the one with the same id', async () => {
      if (!hasGLibPaths) return
      // The definition dialog reopens on an existing brush to fix a
      // frame, so the second save has to land on the same entry — a
      // second "Path" chip would be indistinguishable from the first.
      const { store, engineSet, events } = makeStoreWithSpriteSet()

      expect(store.setTerrain('tiles', { id: 'path', name: 'Path', tiles: { '255': 0 } })).toBe(true)
      expect(store.setTerrain('tiles', { id: 'water', name: 'Water', tiles: { '255': 1 } })).toBe(true)
      expect(store.setTerrain('tiles', { id: 'path', name: 'Dirt path', tiles: { '255': 1 } })).toBe(true)

      const terrains = engineSet.data.terrains ?? []
      expect(terrains.map((t) => `${t.id}:${t.name}`).join(' ')).toBe('path:Dirt path water:Water')
      expect(events.join(' ')).toBe('terrains-changed terrains-changed terrains-changed')
    })

    await it('setTerrain refuses a blank id or an empty table, writing nothing', async () => {
      if (!hasGLibPaths) return
      // An empty table puts a chip on the Ground row that paints
      // nothing, and trying it is the only way to find out.
      const { store, io, engineSet, events } = makeStoreWithSpriteSet()

      expect(store.setTerrain('tiles', { id: '  ', name: 'Blank', tiles: { '255': 0 } })).toBe(false)
      expect(store.setTerrain('tiles', { id: 'empty', name: 'Empty', tiles: {} })).toBe(false)

      expect(engineSet.data.terrains).toBeUndefined()
      expect(io.writes).toHaveLength(0)
      expect(events).toHaveLength(0)
    })

    await it('removeTerrain drops one brush and takes `terrains` with the last', async () => {
      if (!hasGLibPaths) return
      // A sheet whose last brush was removed must read back exactly
      // like one that never had any.
      const { store, io, engineSet } = makeStoreWithSpriteSet()
      store.setTerrain('tiles', { id: 'path', name: 'Path', tiles: { '255': 0 } })
      store.setTerrain('tiles', { id: 'water', name: 'Water', tiles: { '255': 1 } })

      expect(store.removeTerrain('tiles', 'path')).toBe(true)
      expect((engineSet.data.terrains ?? []).map((t) => t.id).join(' ')).toBe('water')

      expect(store.removeTerrain('tiles', 'water')).toBe(true)
      expect(engineSet.data.terrains).toBeUndefined()

      const writes = io.writes.length
      expect(store.removeTerrain('tiles', 'water')).toBe(false)
      expect(io.writes).toHaveLength(writes)
    })

    await it('a rejected sheet-animation edit produces zero broadcasts', async () => {
      if (!hasGLibPaths) return
      // The cast controller's exact composition: `removeAnimation`
      // rejects an unknown id, `applyAnimationEdit` turns that into a
      // store rejection, and the store then skips persist + broadcast.
      const { store, io, session } = makeStoreWithSpriteSet()

      const changed = store.mutateSpriteSetData('tiles', (draft) =>
        applyAnimationEdit(draft, (anims) => removeAnimation(anims, 'no-such-animation')),
      )

      expect(changed).toBe(false)
      expect(io.writes).toHaveLength(0)
      expect(session.sentSpriteSets).toHaveLength(0)
    })

    await it('renameSpriteSet to the same name writes and broadcasts nothing', async () => {
      if (!hasGLibPaths) return
      const { store, io, session } = makeStoreWithSpriteSet()
      store.renameSpriteSet('tiles', '  Tiles  ')
      expect(io.writes).toHaveLength(0)
      expect(session.sentSpriteSets).toHaveLength(0)
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

  await describe('ProjectStore — map CRUD', async () => {
    const twoMapProject = () =>
      makeProjectData({
        maps: [
          { id: 'map-1', path: './maps/map-1.json', type: 'map', name: 'First' },
          { id: 'map-2', path: './maps/map-2.json', type: 'map', name: 'Second' },
        ],
      })

    const mapFile = (id: string) => `/tmp/project-store-spec/maps/${id}.json`
    const projectFile = '/tmp/project-store-spec/game-project.json'

    await it('createMap writes the map file before registering it', async () => {
      // The map paths go through GLib — only real under the GJS target.
      if (!hasGLibPaths) return
      const { store, io, data } = makeStore(makeProjectData(), 'ok', [makeMapData('map-1', 'First')])
      const added: Array<string | undefined> = []
      store.on('maps-changed', (e) => added.push(e.added))

      const id = store.createMap('Forest', MAP_SIZE_PRESETS.medium)

      expect(id).toBe('forest')
      // Write-then-commit: the map file lands first, the project second.
      expect(io.writes.map((w) => w.path)).toStrictEqual([mapFile('forest'), projectFile])
      const written = MapFormat.deserialize(io.writes[0].contents)
      expect(written.columns).toBe(40)
      expect(written.rows).toBe(30)
      expect(written.layers).toHaveLength(1)
      expect(data.maps?.map((m) => m.id)).toStrictEqual(['map-1', 'forest'])
      expect(data.maps?.[1].path).toBe('./maps/forest.json')
      expect(added).toStrictEqual(['forest'])
    })

    await it('createMap registers nothing when the file cannot be written', async () => {
      if (!hasGLibPaths) return
      const { store, data, toasts } = makeStore(makeProjectData(), 'fail', [makeMapData('map-1', 'First')])

      expect(store.createMap('Forest', MAP_SIZE_PRESETS.small)).toBe(null)

      expect(data.maps).toHaveLength(1) // not registered, not persisted
      expect(toasts).toStrictEqual(['map-save-failed'])
    })

    await it('createMap rejects a blank name', async () => {
      if (!hasGLibPaths) return
      const { store, io } = makeStore(makeProjectData(), 'ok', [makeMapData('map-1', 'First')])
      expect(store.createMap('   ', MAP_SIZE_PRESETS.small)).toBe(null)
      expect(io.writes).toHaveLength(0)
    })

    await it('createMap rides the chunked map-create channel', async () => {
      if (!hasGLibPaths) return
      const { store } = makeStore(makeProjectData(), 'ok', [makeMapData('map-1', 'First')])
      const session = makeSession()
      store.setCollabSession(session)

      store.createMap('Forest', MAP_SIZE_PRESETS.small)

      expect(session.sentMaps).toHaveLength(1)
      expect(session.sentMaps[0].reference.id).toBe('forest')
      expect(session.sentMaps[0].mapData.name).toBe('Forest')
      // A map is too big for the plain op channel — nothing goes there.
      expect(session.sent).toHaveLength(0)
    })

    await it('duplicateMap copies the map onto a free atlas slot', async () => {
      if (!hasGLibPaths) return
      const source = makeMapData('map-1', 'First', {
        columns: 24,
        layers: [{ id: 'layer_0', name: 'Ground', visible: true, sprites: [] }],
        editorData: { atlasX: 20, atlasY: 20 },
      } as Partial<MapData>)
      const { store, io, data } = makeStore(makeProjectData(), 'ok', [source])

      const id = store.duplicateMap('map-1', 'Copy of First')

      expect(id).toBe('copy-of-first')
      expect(data.maps?.[1].name).toBe('Copy of First')
      // The live resource entry is the host's job — the store only writes.
      expect(store.mapDatas().map((m) => m.id)).toStrictEqual(['map-1'])
      expect(store.duplicateMap('no-such-map', 'Copy')).toBe(null)

      const written = MapFormat.deserialize(io.writes[0].contents)
      expect(written.id).toBe('copy-of-first')
      expect(written.name).toBe('Copy of First')
      expect(written.columns).toBe(24)
      expect(written.layers[0].name).toBe('Ground')
      // Placed beside the source, never on top of it.
      expect(written.editorData?.atlasX !== 20 || written.editorData?.atlasY !== 20).toBe(true)
      // The source is untouched.
      expect(source.editorData?.atlasX).toBe(20)
    })

    await it('renameMap updates the reference and the live map data', async () => {
      if (!hasGLibPaths) return
      const live = makeMapData('map-1', 'First')
      const { store, io, data } = makeStore(makeProjectData(), 'ok', [live])
      const session = makeSession()
      store.setCollabSession(session)
      const renamed: Array<string | undefined> = []
      store.on('maps-changed', (e) => renamed.push(e.renamed))

      expect(store.renameMap('map-1', '  Forest  ')).toBe(true)

      expect(data.maps?.[0].name).toBe('Forest')
      expect(live.name).toBe('Forest') // both denormalised copies
      expect(io.writes.map((w) => w.path)).toStrictEqual([mapFile('map-1'), projectFile])
      expect(session.sent).toHaveLength(1)
      expect(session.sent[0].kind).toBe(MAP_RENAME_KIND)
      expect(renamed).toStrictEqual(['map-1'])
    })

    await it('renameMap no-ops on a blank, unchanged or unknown name', async () => {
      if (!hasGLibPaths) return
      const { store, io } = makeStore(makeProjectData(), 'ok', [makeMapData('map-1', 'First')])

      expect(store.renameMap('map-1', '   ')).toBe(false)
      expect(store.renameMap('map-1', 'First')).toBe(false)
      expect(store.renameMap('no-such-map', 'Forest')).toBe(false)
      expect(io.writes).toHaveLength(0)
    })

    await it('removeMap drops the reference, the file and the live map', async () => {
      if (!hasGLibPaths) return
      const data = twoMapProject()
      const { store, io } = makeStore(data, 'ok', [makeMapData('map-1', 'First'), makeMapData('map-2', 'Second')])
      const session = makeSession()
      store.setCollabSession(session)
      const removed: Array<string | undefined> = []
      store.on('maps-changed', (e) => removed.push(e.removed))

      expect(store.removeMap('map-1')).toBe(true)

      expect(data.maps?.map((m) => m.id)).toStrictEqual(['map-2'])
      expect(io.removes).toStrictEqual([mapFile('map-1')])
      expect(store.resource?.maps.has('map-1')).toBe(false)
      // The start map followed the deletion, or the project stops validating.
      expect(data.startup?.initialMapId).toBe('map-2')
      expect(session.sent).toHaveLength(1)
      expect(session.sent[0].kind).toBe(MAP_REMOVE_KIND)
      expect(removed).toStrictEqual(['map-1'])
    })

    await it('removeMap refuses the last map and an unknown id', async () => {
      if (!hasGLibPaths) return
      const lone = makeStore(makeProjectData(), 'ok', [makeMapData('map-1', 'First')])
      expect(lone.store.removeMap('map-1')).toBe(false)
      expect(lone.data.maps).toHaveLength(1)
      expect(lone.io.removes).toHaveLength(0)

      const pair = makeStore(twoMapProject(), 'ok', [])
      expect(pair.store.removeMap('no-such-map')).toBe(false)
      expect(pair.data.maps).toHaveLength(2)
      expect(pair.io.removes).toHaveLength(0)
    })

    await it('setStartMap points the startup at a known map only', async () => {
      if (!hasGLibPaths) return
      const data = twoMapProject()
      const { store } = makeStore(data, 'ok', [])
      const session = makeSession()
      store.setCollabSession(session)
      let startupChanges = 0
      store.on('maps-changed', (e) => {
        if (e.startupChanged) startupChanges += 1
      })

      expect(store.setStartMap('map-2')).toBe(true)
      expect(store.startMapId()).toBe('map-2')
      expect(store.setStartMap('map-2')).toBe(false) // already the start map
      expect(store.setStartMap('no-such-map')).toBe(false) // unknown map
      expect(data.startup?.initialMapId).toBe('map-2')
      expect(startupChanges).toBe(1)
      expect(session.sent).toHaveLength(1)
      expect(session.sent[0].kind).toBe(STARTUP_SET_KIND)
    })

    await it('suggests names and counts the doors leading into a map', async () => {
      if (!hasGLibPaths) return
      const maps = [
        makeMapData('map-1', 'First', { objectPlacements: doorInto('map-2') } as Partial<MapData>),
        makeMapData('map-2', 'Second', {
          objectPlacements: [...(doorInto('map-2', 2) ?? []), ...(doorInto('map-1', 3) ?? [])],
        } as Partial<MapData>),
      ]
      const { store } = makeStore(twoMapProject(), 'ok', maps)

      expect(store.suggestMapName('Map %d')).toBe('Map 3')
      expect(store.suggestDuplicateName('map-1', 'Copy of %s')).toBe('Copy of First')
      expect(store.doorsInto('map-2')).toBe(2)
      expect(store.doorsInto('map-1')).toBe(1)
      expect(store.mapDatas().map((m) => m.id)).toStrictEqual(['map-1', 'map-2'])
    })
  })

  await describe('ProjectStore — inbound map ops', async () => {
    const mapFile = (id: string) => `/tmp/project-store-spec/maps/${id}.json`

    await it('applyRemoteMapCreate keeps the peer id but derives the path', async () => {
      if (!hasGLibPaths) return
      const { store, io, data } = makeStore(makeProjectData(), 'ok', [makeMapData('map-1', 'First')])
      const session = makeSession()
      store.setCollabSession(session)
      const added: Array<string | undefined> = []
      store.on('maps-changed', (e) => added.push(e.added))

      const payload: MapCreatePayload = {
        // A hostile `path` the store must ignore — every door that
        // targets the map still needs the sender's `id`, so that is kept.
        reference: { id: 'peer-map', path: '../../escape.json', type: 'map', name: 'Peer Map' },
        mapData: makeMapData('peer-map', 'Peer Map'),
      }
      store.applyRemoteMapCreate(payload)

      expect(io.writes[0].path).toBe(mapFile('peer-map'))
      expect(data.maps?.map((m) => m.id)).toStrictEqual(['map-1', 'peer-map'])
      expect(data.maps?.[1].path).toBe('./maps/peer-map.json')
      expect(added).toStrictEqual(['peer-map'])
      expect(session.sentMaps).toHaveLength(0) // no loopback
    })

    await it('applyRemoteMapCreate is idempotent on re-apply', async () => {
      if (!hasGLibPaths) return
      const { store, data } = makeStore(makeProjectData(), 'ok', [makeMapData('map-1', 'First')])
      const payload: MapCreatePayload = {
        reference: { id: 'peer-map', path: './maps/peer-map.json', type: 'map', name: 'Peer Map' },
        mapData: makeMapData('peer-map', 'Peer Map'),
      }

      store.applyRemoteMapCreate(payload)
      store.applyRemoteMapCreate(payload)

      expect(data.maps?.map((m) => m.id)).toStrictEqual(['map-1', 'peer-map'])
    })

    await it('applyRemoteMapCreate rejects an id that could escape maps/', async () => {
      if (!hasGLibPaths) return
      const { store, io, data } = makeStore(makeProjectData(), 'ok', [makeMapData('map-1', 'First')])

      store.applyRemoteMapCreate({
        reference: { id: '../../../etc/passwd', path: './maps/x.json', type: 'map' },
        mapData: makeMapData('../../../etc/passwd', 'Evil'),
      })

      expect(io.writes).toHaveLength(0)
      expect(data.maps).toHaveLength(1)
    })

    await it('applyRemoteProjectOp routes rename, startup and remove', async () => {
      if (!hasGLibPaths) return
      const data = makeProjectData({
        maps: [
          { id: 'map-1', path: './maps/map-1.json', type: 'map', name: 'First' },
          { id: 'map-2', path: './maps/map-2.json', type: 'map', name: 'Second' },
        ],
      })
      const live = makeMapData('map-2', 'Second')
      const { store, io } = makeStore(data, 'ok', [makeMapData('map-1', 'First'), live])
      const session = makeSession()
      store.setCollabSession(session)

      store.applyRemoteProjectOp(createMapRenameOp({ peerId: 'peer', seq: 1, mapId: 'map-2', name: 'Cave' }))
      expect(data.maps?.[1].name).toBe('Cave')
      expect(live.name).toBe('Cave')

      store.applyRemoteProjectOp(createStartupSetOp({ peerId: 'peer', seq: 2, initialMapId: 'map-2' }))
      expect(data.startup?.initialMapId).toBe('map-2')

      store.applyRemoteProjectOp(createMapRemoveOp({ peerId: 'peer', seq: 3, mapId: 'map-2' }))
      expect(data.maps?.map((m) => m.id)).toStrictEqual(['map-1'])
      expect(data.startup?.initialMapId).toBe('map-1') // repointed at the survivor
      expect(io.removes).toStrictEqual([mapFile('map-2')])

      // Inbound ops never loop back onto the wire.
      expect(session.sent).toHaveLength(0)
      expect(session.sentMaps).toHaveLength(0)
    })

    await it('an inbound startup.set for an unknown map changes nothing', async () => {
      if (!hasGLibPaths) return
      const { store, io, data } = makeStore(makeProjectData(), 'ok', [makeMapData('map-1', 'First')])

      store.applyRemoteProjectOp(createStartupSetOp({ peerId: 'peer', seq: 1, initialMapId: 'ghost' }))

      expect(data.startup?.initialMapId).toBe('map-1')
      expect(io.writes).toHaveLength(0)
    })
  })
  await describe('ProjectStore — flags', async () => {
    const key = { id: 'has-key', name: 'Has key', kind: 'yes-no' as const, initial: false, scope: 'game' as const }

    await it('upsertFlag persists, broadcasts flag.upsert, notifies and returns the undo step', async () => {
      const { store, io, data } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)
      let notified = 0
      store.on('flags-changed', () => notified++)

      const created = store.upsertFlag(key)
      expect(created?.previous).toBe(null)
      const renamed = store.upsertFlag({ ...key, name: 'Key' })
      expect(renamed?.previous?.name).toBe('Has key')

      expect(data.flags).toStrictEqual([{ ...key, name: 'Key' }])
      expect(GameProjectFormat.deserialize(io.writes[1].contents).flags).toStrictEqual([{ ...key, name: 'Key' }])
      expect(session.sent.map((o) => o.kind)).toStrictEqual([FLAG_UPSERT_KIND, FLAG_UPSERT_KIND])
      expect(notified).toBe(2)
      expect(store.upsertFlag({ ...key, initial: 4 })).toBe(null)
    })

    await it('removeFlag removes an unused flag and refuses one a door still names', async () => {
      const door: EntityDefinition = {
        id: 'door',
        name: 'Door',
        components: [{ type: 'actions', actions: [{ id: 'a', type: 'set-flag', flag: 'has-key', value: true }] }],
      }
      const { store, data } = makeStore(makeProjectData({ flags: [key], entityLibrary: [door] }))
      const session = makeSession()
      store.setCollabSession(session)

      const refused = store.removeFlag('has-key')
      expect(refused).toStrictEqual({ removed: false, reason: 'in-use', usage: [{ where: 'entity', id: 'door' }] })
      expect(data.flags).toHaveLength(1)
      expect(session.sent).toHaveLength(0)

      store.removeEntity('door', 'objects')
      session.sent.length = 0
      const done = store.removeFlag('has-key')
      expect(done).toStrictEqual({ removed: true, previous: key })
      expect(data.flags).toStrictEqual([])
      expect(session.sent[0].kind).toBe(FLAG_REMOVE_KIND)
      expect(store.removeFlag('has-key')).toStrictEqual({ removed: false, reason: 'unknown' })
    })

    await it('pruneUnusedPickerFlags removes a "New…" flag nothing names, keeps a used or hand-made one', async () => {
      const { store, data } = makeStore(makeProjectData({ flags: [key] }))
      const id = store.createFlag('Coins', 'number')
      expect(data.flags?.map((f) => f.id)).toStrictEqual(['has-key', id])
      expect(store.pruneUnusedPickerFlags()).toStrictEqual([id])
      expect(data.flags).toStrictEqual([key])
      expect(store.pruneUnusedPickerFlags()).toStrictEqual([])
    })

    await it('applies remote flag ops without re-broadcasting', async () => {
      const { store, data } = makeStore()
      const session = makeSession()
      store.setCollabSession(session)
      store.applyRemoteProjectOp(createFlagUpsertOp({ peerId: 'peer-b', seq: 0, flag: key }))
      expect(data.flags).toStrictEqual([key])
      store.applyRemoteProjectOp(createFlagRemoveOp({ peerId: 'peer-b', seq: 1, flagId: key.id }))
      expect(data.flags).toStrictEqual([])
      expect(session.sent).toHaveLength(0)
    })
  })
}
