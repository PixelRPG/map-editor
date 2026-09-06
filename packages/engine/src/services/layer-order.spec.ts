/**
 * The one ordering rule — plane, then position in `MapData.layers` —
 * as three pure functions. These pin the contract every reader of
 * "which is on top" shares: the initial paint, every rebuild after a
 * live paint, and the walk-on lookup.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { LayerData } from '../types/data/index.ts'
import { layerOrderIndex, orderLayersForWalkOn, sortRefsByLayerOrder } from './layer-order.ts'

const layer = (id: string, plane?: LayerData['plane'], elevation?: number): LayerData => ({
  id,
  name: id,
  visible: true,
  ...(plane ? { plane } : {}),
  ...(elevation !== undefined ? { elevation } : {}),
})

const ref = (layerId: string, spriteId: number) => ({ spriteSetId: 'tiles', spriteId, layerId })

export default async () => {
  await describe('layerOrderIndex', async () => {
    await it('maps every layer id to its array position', async () => {
      const index = layerOrderIndex([layer('bg'), layer('decor'), layer('roofs')])
      expect(index.get('bg')).toBe(0)
      expect(index.get('decor')).toBe(1)
      expect(index.get('roofs')).toBe(2)
      expect(index.get('missing')).toBe(undefined)
    })
  })

  await describe('sortRefsByLayerOrder', async () => {
    await it('orders a cell by layer position, not by insertion order', async () => {
      // The live-paint lie: a paint APPENDS to the cell, so the shadow
      // lists the later-painted `bg` ref last although `bg` is the first
      // layer. The renderer must still draw `bg` first.
      const order = layerOrderIndex([layer('bg'), layer('decor')])
      const cell = [ref('decor', 7), ref('bg', 3)]
      expect(sortRefsByLayerOrder(cell, order).map((r) => r.layerId)).toStrictEqual(['bg', 'decor'])
    })

    await it('is stable for refs of the same layer', async () => {
      const order = layerOrderIndex([layer('bg')])
      const cell = [ref('bg', 1), ref('bg', 2), ref('bg', 3)]
      expect(sortRefsByLayerOrder(cell, order).map((r) => r.spriteId)).toStrictEqual([1, 2, 3])
    })

    await it('sinks refs of a layer the map no longer has to the end', async () => {
      const order = layerOrderIndex([layer('bg')])
      const cell = [ref('gone', 9), ref('bg', 1)]
      expect(sortRefsByLayerOrder(cell, order).map((r) => r.layerId)).toStrictEqual(['bg', 'gone'])
    })

    await it('does not mutate its input', async () => {
      const order = layerOrderIndex([layer('bg'), layer('decor')])
      const cell = [ref('decor', 7), ref('bg', 3)]
      sortRefsByLayerOrder(cell, order)
      expect(cell.map((r) => r.layerId)).toStrictEqual(['decor', 'bg'])
    })
  })

  await describe('orderLayersForWalkOn', async () => {
    await it('asks the highest plane first, whatever the array order says', async () => {
      // An `overlay` layer placed FIRST in the file rendered above the
      // player and still lost the walk-on lookup to every later layer
      // when raw array order decided alone.
      const layers = [layer('roofs', 'overlay'), layer('bg', 'ground'), layer('decor', 'hero')]
      expect(orderLayersForWalkOn(layers).map((l) => l.id)).toStrictEqual(['roofs', 'decor', 'bg'])
    })

    await it('inside a plane, asks the layer that draws on top first (array index descending)', async () => {
      const layers = [layer('bg', 'ground'), layer('paths', 'ground'), layer('puddles', 'ground')]
      expect(orderLayersForWalkOn(layers).map((l) => l.id)).toStrictEqual(['puddles', 'paths', 'bg'])
    })

    await it('treats a plane-less layer as ground', async () => {
      const layers = [layer('legacy'), layer('decor', 'hero')]
      expect(orderLayersForWalkOn(layers).map((l) => l.id)).toStrictEqual(['decor', 'legacy'])
    })

    await it('answers the same over a list filtered to one storey while every layer is storey 0', async () => {
      // Decision 11: elevation enters this lookup later as a FILTER on the
      // list (the walker's storey), never as a third sort key. With every
      // layer at storey 0 the filter is the identity, which this pins.
      const layers = [layer('roofs', 'overlay', 0), layer('bg', 'ground'), layer('decor', 'hero', 0)]
      const storey0 = layers.filter((l) => (l.elevation ?? 0) === 0)
      expect(orderLayersForWalkOn(storey0).map((l) => l.id)).toStrictEqual(
        orderLayersForWalkOn(layers).map((l) => l.id),
      )
    })
  })
}
