import { describe, expect, it } from '@gjsify/unit'
import type { FlagData } from '../types/data/FlagData.ts'
import {
  GameSaveStateComponent,
  LOCAL_PLAYER_ID,
  SAVE_RECORD_VERSION,
  emptyPlayerRecord,
  emptySaveRecord,
  initialSaveRecord,
  migrateSaveRecord,
  resolvedFlagView,
  saveSnapshot,
} from './game-save-state.component.ts'

/** A door everyone shares, and a chest each placement remembers for itself. */
const FLAGS: FlagData[] = [
  { id: 'gate-open', name: 'Gate open', kind: 'yes-no', initial: false, scope: 'game' },
  { id: 'chest-open', name: 'Chest open', kind: 'yes-no', initial: false, scope: 'thing' },
  { id: 'coins', name: 'Coins', kind: 'number', initial: 0, scope: 'game' },
]

export default async () => {
  await describe('save record — one world, many players', async () => {
    await it('starts every declared flag from its initial value, in the world', async () => {
      const record = initialSaveRecord(FLAGS)
      expect(record.schemaVersion).toBe(SAVE_RECORD_VERSION)
      expect(record.world.flags).toStrictEqual({ 'gate-open': false, 'chest-open': false, coins: 0 })
      expect(record.world.things).toStrictEqual({})
      expect(record.world.removedThings).toStrictEqual([])
      expect(record.players).toStrictEqual({})
    })

    await it('gives two players separate positions in one world', async () => {
      // The whole point of the split: "the gate is open" is one fact for
      // the game, "where I am standing" is one fact per person.
      const store = new GameSaveStateComponent(initialSaveRecord(FLAGS))
      store.world.flags['gate-open'] = true

      const ana = store.playerRecord('player-ana')
      ana.mapId = 'kokiri-forest'
      ana.tileX = 4
      ana.tileY = 7
      ana.facing = 'down'

      const bo = store.playerRecord('player-bo')
      bo.mapId = 'tree-house'
      bo.tileX = 1
      bo.tileY = 2
      bo.facing = 'up'

      expect(store.players['player-ana']).toStrictEqual({
        mapId: 'kokiri-forest',
        tileX: 4,
        tileY: 7,
        facing: 'down',
      })
      expect(store.players['player-bo']).toStrictEqual({ mapId: 'tree-house', tileX: 1, tileY: 2, facing: 'up' })
      // One world flag, read the same by both.
      expect(store.flags['gate-open']).toBe(true)
    })

    await it('creates a player record on first ask and keeps handing back the same one', async () => {
      const store = new GameSaveStateComponent(initialSaveRecord(FLAGS))
      const first = store.playerRecord('player-ana')
      expect(first).toStrictEqual(emptyPlayerRecord())
      first.tileX = 9
      expect(store.playerRecord('player-ana').tileX).toBe(9)
      expect(Object.keys(store.players)).toStrictEqual(['player-ana'])
    })
  })

  await describe('thing-scoped values resolve per placement', async () => {
    await it('reads two placements of one flag independently', async () => {
      const record = initialSaveRecord(FLAGS)
      record.world.things['chest-a'] = { 'chest-open': true }

      // Opening one chest leaves the other shut — the bug this scope exists for.
      expect(resolvedFlagView(record.world, 'chest-a')['chest-open']).toBe(true)
      expect(resolvedFlagView(record.world, 'chest-b')['chest-open']).toBe(false)
      // And the game-scoped flags stay visible through both views.
      expect(resolvedFlagView(record.world, 'chest-a')['gate-open']).toBe(false)
    })

    await it('falls back to the world for an entity that is not a placement', async () => {
      const record = initialSaveRecord(FLAGS)
      record.world.flags['chest-open'] = true
      expect(resolvedFlagView(record.world, null)['chest-open']).toBe(true)
    })

    await it('leaves the world’s own bag untouched when it layers a placement on top', async () => {
      const record = initialSaveRecord(FLAGS)
      record.world.things['chest-a'] = { 'chest-open': true }
      resolvedFlagView(record.world, 'chest-a')
      expect(record.world.flags['chest-open']).toBe(false)
    })

    await it('remembers which things the world no longer shows', async () => {
      const record = initialSaveRecord(FLAGS)
      record.world.removedThings.push('pot-3')
      expect(migrateSaveRecord(JSON.parse(JSON.stringify(record))).world.removedThings).toStrictEqual(['pot-3'])
    })
  })

  await describe('migration', async () => {
    await it('reads the old flat flag bag as the world’s flags', async () => {
      const migrated = migrateSaveRecord({ 'gate-open': true, coins: 7 })
      // The legacy shape is the bag itself under `flags`, so a bare bag
      // is not a record — it migrates to an empty one rather than
      // guessing. The real legacy shape is covered below.
      expect(migrated.world.flags).toStrictEqual({})

      const fromLegacy = migrateSaveRecord({ flags: { 'gate-open': true, coins: 7 } })
      expect(fromLegacy.schemaVersion).toBe(SAVE_RECORD_VERSION)
      expect(fromLegacy.world.flags).toStrictEqual({ 'gate-open': true, coins: 7 })
      expect(fromLegacy.world.things).toStrictEqual({})
      expect(fromLegacy.players).toStrictEqual({})
    })

    await it('is lossless and idempotent', async () => {
      const record = initialSaveRecord(FLAGS)
      record.world.flags['gate-open'] = true
      record.world.things['chest-a'] = { 'chest-open': true }
      record.world.removedThings.push('pot-3')
      record.players['player-ana'] = { mapId: 'kokiri-forest', tileX: 4, tileY: 7, facing: 'down' }

      const once = migrateSaveRecord(JSON.parse(JSON.stringify(record)))
      expect(once).toStrictEqual(record)
      expect(migrateSaveRecord(once)).toStrictEqual(record)
    })

    await it('keeps a newer build’s version rather than writing it down', async () => {
      // Forward compatibility: an older reader reads what it understands
      // and does not relabel the record as its own.
      expect(migrateSaveRecord({ schemaVersion: 99, world: { flags: { a: 1 } } }).schemaVersion).toBe(99)
    })

    await it('drops nothing it understands and invents nothing it does not', async () => {
      const migrated = migrateSaveRecord({
        schemaVersion: 1,
        world: {
          flags: { a: true, bad: { nested: 1 } },
          things: { 'chest-a': { b: 2, worse: [] } },
          removedThings: ['x', 5],
        },
        players: { ana: { mapId: 'm', tileX: 1, tileY: 'two', extra: 'ignored' } },
      })
      expect(migrated.world.flags).toStrictEqual({ a: true })
      expect(migrated.world.things['chest-a']).toStrictEqual({ b: 2 })
      expect(migrated.world.removedThings).toStrictEqual(['x'])
      expect(migrated.players.ana).toStrictEqual({ mapId: 'm', tileX: 1, tileY: null, facing: null })
    })

    await it('reads junk as an empty record rather than throwing', async () => {
      for (const junk of [null, undefined, 42, 'nope', []]) {
        expect(migrateSaveRecord(junk)).toStrictEqual(emptySaveRecord())
      }
    })

    await it('prefers the new world over a flat bag carried alongside it', async () => {
      const migrated = migrateSaveRecord({ flags: { a: 1 }, world: { flags: { a: 2, b: 3 } } })
      expect(migrated.world.flags).toStrictEqual({ a: 2, b: 3 })
    })

    await it('runs every record a component is built from through the migration', async () => {
      expect(new GameSaveStateComponent({ a: true }).flags).toStrictEqual({})
      expect(new GameSaveStateComponent().record).toStrictEqual(emptySaveRecord())
      const store = new GameSaveStateComponent(migrateSaveRecord({ flags: { a: true } }))
      expect(store.flags).toStrictEqual({ a: true })
    })
  })

  await describe('runtime snapshot shape', async () => {
    await it('reports the whole record, flat flags first', async () => {
      const record = initialSaveRecord(FLAGS)
      record.world.flags['gate-open'] = true
      record.world.things['chest-a'] = { 'chest-open': true }
      record.world.removedThings.push('pot-3')
      record.players['player-ana'] = { mapId: 'kokiri-forest', tileX: 4, tileY: 7, facing: 'down' }

      expect(saveSnapshot(record, 'player-ana')).toStrictEqual({
        flags: { 'gate-open': true, 'chest-open': false, coins: 0 },
        thingFlags: { 'chest-a': { 'chest-open': true } },
        removedThings: ['pot-3'],
        players: { 'player-ana': { mapId: 'kokiri-forest', tileX: 4, tileY: 7, facing: 'down' } },
        localPlayerId: 'player-ana',
      })
    })

    await it('copies all the way down, so two reads can be compared', async () => {
      // A driver holds one snapshot and diffs it against the next; handing
      // out the live record would make every comparison pass.
      const record = initialSaveRecord(FLAGS)
      record.world.things['chest-a'] = { 'chest-open': false }
      record.players['player-ana'] = { mapId: 'm', tileX: 0, tileY: 0, facing: 'down' }
      const before = saveSnapshot(record, 'player-ana')

      record.world.flags['gate-open'] = true
      record.world.things['chest-a']['chest-open'] = true
      record.world.removedThings.push('pot-3')
      record.players['player-ana'].tileX = 5

      expect(before.flags['gate-open']).toBe(false)
      expect(before.thingFlags['chest-a']['chest-open']).toBe(false)
      expect(before.removedThings).toStrictEqual([])
      expect(before.players['player-ana'].tileX).toBe(0)
    })

    await it('reads a missing record as an empty one', async () => {
      expect(saveSnapshot(null, LOCAL_PLAYER_ID)).toStrictEqual({
        flags: {},
        thingFlags: {},
        removedThings: [],
        players: {},
        localPlayerId: LOCAL_PLAYER_ID,
      })
    })
  })
}
