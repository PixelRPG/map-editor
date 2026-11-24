import { describe, expect, it } from '@gjsify/unit'
import type { FlagData, FlagUsage } from '@pixelrpg/engine'
import { memorySections, memoryShape } from './game-memory.model.ts'

const DEFS: FlagData[] = [
  { id: 'coins', name: 'Coins', kind: 'number', initial: 0, scope: 'game' },
  { id: 'has-key', name: 'Has the key', kind: 'yes-no', initial: false, scope: 'game' },
  { id: 'opened', name: 'Opened', kind: 'yes-no', initial: false, scope: 'thing' },
]

const usage = (flagId: string, placementId: string | null, entityId: string): FlagUsage => ({
  flagId,
  access: 'write',
  via: 'set-flag',
  mapId: placementId ? 'm' : null,
  placementId,
  entityId,
  stateIndex: null,
  actionIndex: 0,
})

// "opened" is written by the chest's library entry, so every chest placement carries it.
const USAGES = new Map<string, FlagUsage[]>([['opened', [usage('opened', null, 'chest')]]])

const PLACEMENTS = [
  { id: 'p-b', defId: 'chest', name: 'Chest', tileX: 9, tileY: 2 },
  { id: 'p-a', defId: 'chest', name: 'Chest', tileX: 3, tileY: 2 },
  { id: 'p-sign', defId: 'sign', name: 'Sign', tileX: 1, tileY: 1 },
]

export default async () => {
  await describe('game-memory.model', async () => {
    await it('lists game-scoped flags with their written value, else their initial', async () => {
      const { game } = memorySections(DEFS, PLACEMENTS, USAGES, { flags: { coins: 5 }, thingFlags: {} })
      expect(game.map((r) => [r.flag, r.value, r.thing])).toStrictEqual([
        ['coins', 5, null],
        ['has-key', false, null],
      ])
    })

    await it('groups thing-scoped values per placement, by name, in reading order', async () => {
      const { things } = memorySections(DEFS, PLACEMENTS, USAGES, {
        flags: {},
        thingFlags: { 'p-a': { opened: true } },
      })
      expect(things.map((t) => [t.name, t.placementId, t.rows[0].value])).toStrictEqual([
        ['Chest', 'p-a', true],
        ['Chest', 'p-b', false],
      ])
      expect(things[0].rows[0].key).toBe('p-a/opened')
      expect(things[0].rows[0].thing).toBe('p-a')
    })

    await it('leaves out a placement whose data names no thing-scoped flag', async () => {
      const { things } = memorySections(DEFS, PLACEMENTS, USAGES, { flags: {}, thingFlags: {} })
      expect(things.some((t) => t.placementId === 'p-sign')).toBe(false)
    })

    await it('counts a usage on the placement itself, not only on its library entry', async () => {
      const own = new Map([['opened', [usage('opened', 'p-sign', 'sign')]]])
      const { things } = memorySections(DEFS, PLACEMENTS, own, { flags: {}, thingFlags: {} })
      expect(things.map((t) => t.placementId)).toStrictEqual(['p-sign'])
    })

    await it('keeps the shape when only a value changes, and changes it when a row appears', async () => {
      const before = memorySections(DEFS, PLACEMENTS, USAGES, { flags: { coins: 1 }, thingFlags: {} })
      const after = memorySections(DEFS, PLACEMENTS, USAGES, {
        flags: { coins: 9 },
        thingFlags: { 'p-a': { opened: true } },
      })
      expect(memoryShape(after)).toBe(memoryShape(before))
      const fewer = memorySections(DEFS.slice(1), PLACEMENTS, USAGES, { flags: {}, thingFlags: {} })
      expect(memoryShape(fewer) === memoryShape(before)).toBe(false)
    })
  })
}
