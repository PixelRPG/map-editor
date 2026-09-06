/**
 * The Layers tab shows the map's layer ARRAY as three sections whose
 * row order is the inverse of the array (top row = draws on top), and
 * turns a drop back into an array position. Both directions are pinned
 * here without GTK: a mistake in either would put a layer somewhere
 * other than where the child let go of it.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { LayerPlane } from '@pixelrpg/engine'
import { layersInSection, planeOf, resolveLayerDrop, SECTION_PLANES } from './layer-sections.ts'

const layer = (id: string, plane?: LayerPlane) => ({ id, ...(plane ? { plane } : {}) })

/** ground: bg, paths — hero: rocks — overlay: roofs (array order as written). */
const layers = [layer('bg', 'ground'), layer('paths', 'ground'), layer('rocks', 'hero'), layer('roofs', 'overlay')]

export default async () => {
  await describe('SECTION_PLANES', async () => {
    await it('reads top to bottom like the world: overlay, hero, ground', async () => {
      expect([...SECTION_PLANES]).toStrictEqual(['overlay', 'hero', 'ground'])
    })
  })

  await describe('planeOf', async () => {
    await it('treats a plane-less layer as ground', async () => {
      expect(planeOf(layer('legacy'))).toBe('ground')
      expect(planeOf(layer('roofs', 'overlay'))).toBe('overlay')
    })
  })

  await describe('layersInSection', async () => {
    await it('lists a section top to bottom by descending array index', async () => {
      expect(layersInSection(layers, 'ground').map((l) => l.id)).toStrictEqual(['paths', 'bg'])
    })

    await it('keeps a section empty when no layer is on its plane', async () => {
      expect(layersInSection([layer('bg', 'ground')], 'overlay')).toStrictEqual([])
    })
  })

  await describe('resolveLayerDrop', async () => {
    await it('"above" a row lands right after it in the array (drawn on top)', async () => {
      // bg dragged above paths: remaining = [paths, rocks, roofs]; paths at 0 → index 1.
      expect(resolveLayerDrop(layers, 'bg', 'ground', { layerId: 'paths', position: 'above' })).toStrictEqual({
        plane: 'ground',
        index: 1,
      })
    })

    await it('"below" a row lands right before it in the array (drawn under)', async () => {
      // paths dragged below bg: remaining = [bg, rocks, roofs]; bg at 0 → index 0.
      expect(resolveLayerDrop(layers, 'paths', 'ground', { layerId: 'bg', position: 'below' })).toStrictEqual({
        plane: 'ground',
        index: 0,
      })
    })

    await it('carries the target plane of a drop into another section', async () => {
      // rocks dragged above roofs (overlay section): remaining = [bg, paths, roofs]; roofs at 2 → index 3.
      expect(resolveLayerDrop(layers, 'rocks', 'overlay', { layerId: 'roofs', position: 'above' })).toStrictEqual({
        plane: 'overlay',
        index: 3,
      })
    })

    await it('released on the empty space of a populated section goes to the bottom of that section', async () => {
      // roofs into the ground section's empty space: remaining = [bg, paths, rocks]; ground's lowest index = 0.
      expect(resolveLayerDrop(layers, 'roofs', 'ground', null)).toStrictEqual({ plane: 'ground', index: 0 })
    })

    await it('released in an empty section appends at the end of the array', async () => {
      const noOverlay = layers.slice(0, 3)
      expect(resolveLayerDrop(noOverlay, 'bg', 'overlay', null)).toStrictEqual({ plane: 'overlay', index: 2 })
    })

    await it('is null for an unknown dragged layer or anchor', async () => {
      expect(resolveLayerDrop(layers, 'ghost', 'ground', null)).toBe(null)
      expect(resolveLayerDrop(layers, 'bg', 'ground', { layerId: 'ghost', position: 'above' })).toBe(null)
    })
  })
}
