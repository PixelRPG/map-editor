import { describe, expect, it } from '@gjsify/unit'

import type { MapData } from '@pixelrpg/engine'
import { toLayerDescriptors } from './layer-descriptors.ts'

const mapData = (partial: Partial<MapData>): MapData =>
  ({ id: 'm1', columns: 4, rows: 4, tileWidth: 16, tileHeight: 16, layers: [], ...partial }) as MapData

export default async () => {
  await describe('toLayerDescriptors', async () => {
    await it('counts a layer’s own sprites and the placements that reference it', async () => {
      const [background] = toLayerDescriptors(
        mapData({
          layers: [{ id: 'background', name: 'Background', sprites: [1, 2, 3] }],
          objectPlacements: [
            { id: 'p1', layerId: 'background', tileX: 0, tileY: 0 },
            { id: 'p2', layerId: 'background', tileX: 1, tileY: 0 },
            { id: 'p3', layerId: 'other', tileX: 2, tileY: 0 },
          ],
        }),
      )
      expect(background.tileCount).toBe(5)
    })

    await it('defaults the flags a map file may omit', async () => {
      const [layer] = toLayerDescriptors(mapData({ layers: [{ id: 'l1', name: 'L1' }] }))
      expect(layer.visible).toBe(true)
      expect(layer.locked).toBe(false)
      expect(layer.tileCount).toBe(0)
    })

    await it('keeps explicit flags', async () => {
      const [layer] = toLayerDescriptors(mapData({ layers: [{ id: 'l1', name: 'L1', visible: false, locked: true }] }))
      expect(layer.visible).toBe(false)
      expect(layer.locked).toBe(true)
    })

    await it('carries the plane through and leaves it absent when the file has none', async () => {
      const [roofs, legacy] = toLayerDescriptors(
        mapData({
          layers: [
            { id: 'roofs', name: 'Roofs', visible: true, plane: 'overlay' },
            { id: 'legacy', name: 'Legacy', visible: true },
          ],
        }),
      )
      expect(roofs.plane).toBe('overlay')
      expect('plane' in legacy).toBe(false)
    })

    await it('is empty for a map without layers', async () => {
      expect(toLayerDescriptors(mapData({}))).toStrictEqual([])
    })
  })
}
