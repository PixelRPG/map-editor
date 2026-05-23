import { describe, expect, it } from 'vitest'
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

describe('isLayerVisible', () => {
  it('returns true for layers with `visible: true`', () => {
    const res = makeMapResource([{ id: 'a', name: 'A', visible: true }])
    expect(isLayerVisible(res, 'a')).toBe(true)
  })

  it('returns false for layers with `visible: false`', () => {
    const res = makeMapResource([{ id: 'a', name: 'A', visible: false }])
    expect(isLayerVisible(res, 'a')).toBe(false)
  })

  it('treats missing visible flag as visible (legacy projects)', () => {
    const res = makeMapResource([{ id: 'a', name: 'A', visible: undefined as unknown as boolean }])
    expect(isLayerVisible(res, 'a')).toBe(true)
  })

  it('returns true for unknown layer ids (defensive default)', () => {
    const res = makeMapResource([{ id: 'a', name: 'A', visible: true }])
    expect(isLayerVisible(res, 'nope')).toBe(true)
  })
})

describe('collectHiddenLayerIds', () => {
  it('returns only explicitly-hidden layer ids', () => {
    const res = makeMapResource([
      { id: 'a', name: 'A', visible: true },
      { id: 'b', name: 'B', visible: false },
      { id: 'c', name: 'C', visible: false },
      { id: 'd', name: 'D', visible: undefined as unknown as boolean },
    ])
    const hidden = collectHiddenLayerIds(res)
    expect(hidden).toEqual(new Set(['b', 'c']))
  })

  it('returns an empty set when every layer is visible', () => {
    const res = makeMapResource([
      { id: 'a', name: 'A', visible: true },
      { id: 'b', name: 'B', visible: true },
    ])
    expect(collectHiddenLayerIds(res).size).toBe(0)
  })

  it('returns an empty set when mapData is missing', () => {
    const res = { mapData: undefined } as unknown as MapResource
    expect(collectHiddenLayerIds(res).size).toBe(0)
  })
})
