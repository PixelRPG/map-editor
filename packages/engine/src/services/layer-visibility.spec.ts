import { describe, expect, it } from '@gjsify/unit'

import type { MapResource } from '../resource/MapResource.ts'
import type { LayerData } from '../types/data/index.ts'
import { collectHiddenLayerIds, isLayerVisible } from './layer-visibility.ts'

function makeMapResource(layers: Array<Partial<LayerData> & Pick<LayerData, 'id' | 'name'>>): MapResource {
  return {
    mapData: {
      layers: layers.map((l) => ({ visible: true, ...l })),
    },
    // biome-ignore lint/suspicious/noExplicitAny: test stub mirrors only the fields exercised
  } as any
}

export default async () => {
  await describe('isLayerVisible', async () => {
    await it('returns true for layers with `visible: true`', async () => {
      const res = makeMapResource([{ id: 'a', name: 'A', visible: true }])
      expect(isLayerVisible(res, 'a')).toBe(true)
    })

    await it('returns false for layers with `visible: false`', async () => {
      const res = makeMapResource([{ id: 'a', name: 'A', visible: false }])
      expect(isLayerVisible(res, 'a')).toBe(false)
    })

    await it('treats missing visible flag as visible (legacy projects)', async () => {
      const res = makeMapResource([{ id: 'a', name: 'A', visible: undefined as unknown as boolean }])
      expect(isLayerVisible(res, 'a')).toBe(true)
    })

    await it('returns true for unknown layer ids (defensive default)', async () => {
      const res = makeMapResource([{ id: 'a', name: 'A', visible: true }])
      expect(isLayerVisible(res, 'nope')).toBe(true)
    })
  })

  await describe('collectHiddenLayerIds', async () => {
    await it('returns only explicitly-hidden layer ids', async () => {
      const res = makeMapResource([
        { id: 'a', name: 'A', visible: true },
        { id: 'b', name: 'B', visible: false },
        { id: 'c', name: 'C', visible: false },
        { id: 'd', name: 'D', visible: undefined as unknown as boolean },
      ])
      const hidden = collectHiddenLayerIds(res)
      // `toStrictEqual` doesn't deep-compare Sets to other Sets by value,
      // so unpack into sorted arrays.
      expect([...hidden].sort()).toStrictEqual(['b', 'c'])
    })

    await it('returns an empty set when every layer is visible', async () => {
      const res = makeMapResource([
        { id: 'a', name: 'A', visible: true },
        { id: 'b', name: 'B', visible: true },
      ])
      expect(collectHiddenLayerIds(res).size).toBe(0)
    })

    await it('returns an empty set when mapData is missing', async () => {
      const res = { mapData: undefined } as unknown as MapResource
      expect(collectHiddenLayerIds(res).size).toBe(0)
    })
  })
}
