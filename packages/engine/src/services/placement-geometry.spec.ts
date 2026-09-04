/**
 * Where the camera must sit to centre an object placement.
 *
 * Pinned separately from the camera tween because the two failure
 * modes look identical on screen: a wrong centre and a refused pan both
 * leave the placement off-centre.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { MapData } from '../types/data/index.ts'
import { placementTileCentre } from './placement-geometry.ts'

const mapData = {
  id: 'town',
  version: '1',
  tileWidth: 16,
  tileHeight: 16,
  columns: 20,
  rows: 15,
  layers: [],
  objectPlacements: [
    { id: 'chest-1', layerId: 'ground', tileX: 3, tileY: 4, defId: 'chest' },
    { id: 'npc-1', layerId: 'ground', tileX: 0, tileY: 0, defId: 'villager' },
  ],
} as unknown as MapData

export default async () => {
  await describe('placementTileCentre', async () => {
    await it('centres on the placement tile', async () => {
      expect(placementTileCentre(mapData, 'chest-1')).toStrictEqual({ x: 56, y: 72 })
    })

    await it('centres the origin tile at half a cell', async () => {
      expect(placementTileCentre(mapData, 'npc-1')).toStrictEqual({ x: 8, y: 8 })
    })

    await it('falls back to the default tile size when the map declares none', async () => {
      const sizeless = { ...mapData, tileWidth: undefined, tileHeight: undefined } as unknown as MapData
      expect(placementTileCentre(sizeless, 'npc-1')).toStrictEqual({ x: 8, y: 8 })
    })

    await it('returns null for an unknown placement id', async () => {
      expect(placementTileCentre(mapData, 'nope')).toBe(null)
    })

    await it('returns null for a map with no placements at all', async () => {
      expect(placementTileCentre({ ...mapData, objectPlacements: undefined } as MapData, 'chest-1')).toBe(null)
    })

    await it('returns null without map data', async () => {
      expect(placementTileCentre(null, 'chest-1')).toBe(null)
      expect(placementTileCentre(undefined, 'chest-1')).toBe(null)
    })
  })
}
