import { describe, expect, it } from '@gjsify/unit'

import {
  connectionTouches,
  type DoorLink,
  fanGroups,
  type MapConnection,
  mapPairKey,
  pairDistance,
  pairDoors,
} from './map-connections.model.ts'

const door = (from: string, fx: number, fy: number, to: string | null, tx = 0, ty = 0, label = ''): DoorLink => ({
  from,
  fx,
  fy,
  to,
  tx,
  ty,
  label,
})

/** The shape a connection reads as, minus the label, for compact asserts. */
const shape = (c: MapConnection) => ({
  kind: c.kind,
  from: `${c.from.mapId}@${c.from.tileX},${c.from.tileY}`,
  to: c.to ? `${c.to.mapId}@${c.to.tileX},${c.to.tileY}` : null,
  doors: [...c.doors],
})

export default async () => {
  await describe('map-connections.model', async () => {
    await describe('pairDistance', async () => {
      await it('pairs two doors that land on each other', async () => {
        const a = door('forest', 5, 5, 'cave', 1, 1)
        const b = door('cave', 1, 1, 'forest', 5, 5)
        expect(pairDistance(a, b)).toBe(0)
      })

      await it('tolerates an arrival tile IN FRONT of the door', async () => {
        // The real `games/zelda-like` shape: tree-house's door is at
        // (10, 13) but kokiri-forest's door arrives at (10, 12).
        const a = door('kokiri-forest', 76, 67, 'tree-house', 10, 12)
        const b = door('tree-house', 10, 13, 'kokiri-forest', 76, 68)
        expect(pairDistance(a, b)).toBe(2)
      })

      await it('counts a diagonal step as one tile', async () => {
        const a = door('a', 0, 0, 'b', 4, 4)
        const b = door('b', 5, 5, 'a', 0, 0)
        expect(pairDistance(a, b)).toBe(1)
      })

      await it('refuses doors that land two tiles apart', async () => {
        const a = door('a', 0, 0, 'b', 3, 3)
        const b = door('b', 5, 5, 'a', 0, 0)
        expect(pairDistance(a, b)).toBe(null)
      })

      await it('refuses doors between different maps', async () => {
        const a = door('a', 0, 0, 'b', 0, 0)
        const b = door('c', 0, 0, 'a', 0, 0)
        expect(pairDistance(a, b)).toBe(null)
      })

      await it('refuses a door that leads nowhere', async () => {
        const a = door('a', 0, 0, null)
        const b = door('a', 0, 0, 'a', 0, 0)
        expect(pairDistance(a, b)).toBe(null)
      })
    })

    await describe('pairDoors', async () => {
      await it('merges a door and its way back into one solid line', async () => {
        const connections = pairDoors([
          door('forest', 13, 5, 'village', 0, 6, 'Path'),
          door('village', 0, 6, 'forest', 13, 5, 'Back'),
        ])
        expect(connections.length).toBe(1)
        expect(shape(connections[0])).toStrictEqual({
          kind: 'pair',
          from: 'forest@13,5',
          to: 'village@0,6',
          doors: [0, 1],
        })
      })

      await it('puts BOTH ends on a door tile, not on an arrival tile', async () => {
        // A pair's far end is the partner door's own tile — that is
        // what makes the line point at where the door is.
        const connections = pairDoors([
          door('kokiri-forest', 76, 67, 'tree-house', 10, 12),
          door('tree-house', 10, 13, 'kokiri-forest', 76, 68),
        ])
        expect(shape(connections[0]).to).toBe('tree-house@10,13')
      })

      await it('keeps a door with no way back one-way', async () => {
        const connections = pairDoors([door('village', 7, 13, 'cave', 8, 1, 'Cave Mouth')])
        expect(shape(connections[0])).toStrictEqual({
          kind: 'one-way',
          from: 'village@7,13',
          to: 'cave@8,1',
          doors: [0],
        })
      })

      await it('ends a one-way line on the ARRIVAL tile', async () => {
        const connections = pairDoors([door('a', 0, 0, 'b', 9, 4)])
        expect(shape(connections[0]).to).toBe('b@9,4')
      })

      await it('reports a door with no target as broken', async () => {
        const connections = pairDoors([door('village', 3, 4, null, 0, 0, 'Shed')])
        expect(shape(connections[0])).toStrictEqual({
          kind: 'broken',
          from: 'village@3,4',
          to: null,
          doors: [0],
        })
      })

      await it('gives the tightest fit the pair and leaves the rest one-way', async () => {
        // `games/zelda-like`: two adjacent doors lead to the same tile
        // of tree-house, which has exactly one door back.
        const connections = pairDoors([
          door('kokiri-forest', 76, 67, 'tree-house', 10, 12),
          door('kokiri-forest', 77, 67, 'tree-house', 10, 12),
          door('tree-house', 10, 13, 'kokiri-forest', 76, 68),
        ])
        expect(connections.map(shape)).toStrictEqual([
          { kind: 'pair', from: 'kokiri-forest@76,67', to: 'tree-house@10,13', doors: [0, 2] },
          { kind: 'one-way', from: 'kokiri-forest@77,67', to: 'tree-house@10,12', doors: [1] },
        ])
      })

      await it('prefers the closer candidate over input order', async () => {
        const connections = pairDoors([
          door('a', 0, 0, 'b', 1, 1),
          door('a', 5, 5, 'b', 0, 0),
          door('b', 0, 0, 'a', 5, 5),
        ])
        // Door 1 ↔ 2 is an exact match (distance 0); door 0's arrival
        // is one tile off, so it loses the only partner and stays
        // one-way even though it came first.
        expect(connections.map((c) => [c.kind, [...c.doors]])).toStrictEqual([
          ['one-way', [0]],
          ['pair', [1, 2]],
        ])
      })

      await it('is order-stable for equally good candidates', async () => {
        const doors = [door('a', 0, 0, 'b', 0, 0), door('a', 9, 9, 'b', 0, 0), door('b', 0, 0, 'a', 0, 0)]
        expect(pairDoors(doors).map((c) => [...c.doors])).toStrictEqual([[0, 2], [1]])
      })

      await it('takes the label from the owning door, falling back to its mate', async () => {
        const connections = pairDoors([door('a', 0, 0, 'b', 0, 0, ''), door('b', 0, 0, 'a', 0, 0, 'Gate')])
        expect(connections[0].label).toBe('Gate')
      })

      await it('pairs two adjacent doors on the SAME map', async () => {
        const connections = pairDoors([door('loop', 2, 2, 'loop', 8, 8), door('loop', 8, 8, 'loop', 2, 2)])
        expect(connections.map((c) => c.kind)).toStrictEqual(['pair'])
      })

      await it('returns nothing for no doors', async () => {
        expect(pairDoors([])).toStrictEqual([])
      })
    })

    await describe('connectionTouches', async () => {
      await it('sees both ends', async () => {
        const [connection] = pairDoors([door('a', 0, 0, 'b', 1, 1)])
        expect(connectionTouches(connection, 'a')).toBe(true)
        expect(connectionTouches(connection, 'b')).toBe(true)
        expect(connectionTouches(connection, 'c')).toBe(false)
      })

      await it('sees the only end of a broken door', async () => {
        const [connection] = pairDoors([door('a', 0, 0, null)])
        expect(connectionTouches(connection, 'a')).toBe(true)
      })
    })

    await describe('mapPairKey', async () => {
      await it('is the same either way round', async () => {
        const [there] = pairDoors([door('a', 0, 0, 'b', 0, 0)])
        const [back] = pairDoors([door('b', 0, 0, 'a', 0, 0)])
        expect(mapPairKey(there)).toBe(mapPairKey(back))
      })

      await it('separates a different pair of maps', async () => {
        const [ab] = pairDoors([door('a', 0, 0, 'b', 0, 0)])
        const [ac] = pairDoors([door('a', 0, 0, 'c', 0, 0)])
        expect(mapPairKey(ab) === mapPairKey(ac)).toBe(false)
      })
    })

    await describe('fanGroups', async () => {
      await it('numbers the lines that share a pair of maps', async () => {
        const connections = pairDoors([
          door('a', 0, 0, 'b', 5, 5),
          door('a', 1, 1, 'b', 6, 6),
          door('a', 2, 2, 'c', 0, 0),
        ])
        expect(fanGroups(connections)).toStrictEqual([
          { index: 0, count: 2 },
          { index: 1, count: 2 },
          { index: 0, count: 1 },
        ])
      })

      await it('leaves a lone line unfanned', async () => {
        expect(fanGroups(pairDoors([door('a', 0, 0, 'b', 0, 0)]))).toStrictEqual([{ index: 0, count: 1 }])
      })

      await it('handles an empty world', async () => {
        expect(fanGroups([])).toStrictEqual([])
      })
    })
  })
}
