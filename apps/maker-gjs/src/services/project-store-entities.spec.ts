import { describe, expect, it } from '@gjsify/unit'
import {
  createEntityRemoveOp,
  createEntityUpsertOp,
  createPlayerSetOp,
  createSpriteSetRemoveOp,
  type EntityDefinition,
  type GameProjectData,
  type MapReference,
} from '@pixelrpg/engine'

import { applyEntityLibraryOp, buildRefOptions, findEntityById } from './project-store-entities.ts'

const npc: EntityDefinition = { id: 'npc-1', name: 'NPC', components: [] }
const hero: EntityDefinition = { id: 'hero', name: 'Hero', components: [] }

const makeData = (overrides: Partial<GameProjectData> = {}): GameProjectData =>
  ({
    version: '1',
    id: 'test-project',
    name: 'Test Project',
    startup: { initialMapId: 'map-1' },
    maps: [{ id: 'map-1', path: './maps/map-1.json', type: 'map' }],
    spriteSets: [],
    entityLibrary: [],
    ...overrides,
  }) as GameProjectData

export default async () => {
  await describe('findEntityById', async () => {
    await it('finds by stable id and reports null for an unknown one', async () => {
      expect(findEntityById([npc, hero], 'hero')?.name).toBe('Hero')
      expect(findEntityById([npc, hero], 'ghost')).toBeNull()
      expect(findEntityById([], 'npc-1')).toBeNull()
    })
  })

  await describe('buildRefOptions', async () => {
    await it('labels maps by name, falling back to the id', async () => {
      const maps: MapReference[] = [
        { id: 'map-1', path: './maps/map-1.json', type: 'map', name: 'Town' },
        { id: 'map-2', path: './maps/map-2.json', type: 'map' },
      ]
      expect(buildRefOptions(maps, undefined).maps).toStrictEqual([
        { value: 'map-1', label: 'Town' },
        { value: 'map-2', label: 'map-2' },
      ])
    })

    await it('labels appearances by descriptor name, falling back to the set id', async () => {
      const spriteSets = new Map([
        ['hero', { data: { name: 'Hero Sheet' } }],
        ['unloaded', {}],
      ])
      expect(buildRefOptions(undefined, spriteSets).appearances).toStrictEqual([
        { value: 'hero', label: 'Hero Sheet' },
        { value: 'unloaded', label: 'unloaded' },
      ])
    })

    await it('yields empty lists with no project loaded', async () => {
      expect(buildRefOptions(undefined, undefined)).toStrictEqual({ maps: [], appearances: [] })
    })
  })

  await describe('applyEntityLibraryOp', async () => {
    await it('applies entity.upsert and replaces by id', async () => {
      const data = makeData()
      expect(applyEntityLibraryOp(data, createEntityUpsertOp({ peerId: 'p', seq: 0, entity: npc }))).toBe(true)
      applyEntityLibraryOp(data, createEntityUpsertOp({ peerId: 'p', seq: 1, entity: { ...npc, name: 'Renamed' } }))
      expect(data.entityLibrary).toHaveLength(1)
      expect(data.entityLibrary?.[0]?.name).toBe('Renamed')
    })

    await it('applies player.set and entity.remove, clearing the player flag', async () => {
      const data = makeData({ entityLibrary: [{ ...npc }] })
      applyEntityLibraryOp(data, createPlayerSetOp({ peerId: 'p', seq: 0, playerActorId: 'npc-1' }))
      expect(data.playerActorId).toBe('npc-1')

      const remove = createEntityRemoveOp({ peerId: 'p', seq: 1, entityId: 'npc-1' })
      expect(applyEntityLibraryOp(data, remove)).toBe(true)
      // Idempotent: a duplicate remove converges instead of throwing.
      expect(applyEntityLibraryOp(data, remove)).toBe(true)
      expect(data.entityLibrary).toHaveLength(0)
      expect(data.playerActorId).toBeUndefined()
    })

    await it('declines a non-entity-library op without touching the data', async () => {
      const data = makeData({ entityLibrary: [{ ...npc }] })
      const op = createSpriteSetRemoveOp({ peerId: 'p', seq: 0, spriteSetId: 'tiles' })
      expect(applyEntityLibraryOp(data, op)).toBe(false)
      expect(data.entityLibrary).toHaveLength(1)
    })
  })
}
