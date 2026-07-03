/**
 * Apply/revert behaviour of `AddLayerCommand` against a realised
 * `MapScene`'s `MapData.layers`. The layer list is document state, so
 * add rides a Command (peers + undo). `revert` must remove exactly the
 * layer it added, leaving the pre-existing layers intact.
 */

import { describe, expect, it } from '@gjsify/unit'

import { MapScene } from '../scenes/map.scene.ts'
import type { LayerData } from '../types/data/index.ts'
import { AddLayerCommand } from './layer-lifecycle.command.ts'

/** Duck-typed `MapScene` (no engine wiring) holding a mutable layer list. */
function makeScene(layers: LayerData[]): MapScene {
  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, { mapResource: { mapData: { layers } } })
  return scene
}

function ids(scene: MapScene): string[] {
  // biome-ignore lint/suspicious/noExplicitAny: test reads the stubbed mapData
  return ((scene as any).mapResource.mapData.layers as LayerData[]).map((l) => l.id)
}

export default async () => {
  await describe('AddLayerCommand', async () => {
    await it('appends the new layer; revert removes it, keeping the rest', async () => {
      const scene = makeScene([{ id: 'ground', name: 'Ground', visible: true }])
      const cmd = new AddLayerCommand({ layer: { id: 'decor', name: 'Decor', visible: true } })

      cmd.apply(scene)
      expect(ids(scene)).toStrictEqual(['ground', 'decor'])

      cmd.revert(scene)
      expect(ids(scene)).toStrictEqual(['ground'])
    })

    await it('inserts at an explicit index', async () => {
      const scene = makeScene([
        { id: 'a', name: 'A', visible: true },
        { id: 'b', name: 'B', visible: true },
      ])
      new AddLayerCommand({ layer: { id: 'mid', name: 'Mid', visible: true }, index: 1 }).apply(scene)
      expect(ids(scene)).toStrictEqual(['a', 'mid', 'b'])
    })

    await it('is idempotent — a duplicate id is not added twice', async () => {
      const scene = makeScene([{ id: 'ground', name: 'Ground', visible: true }])
      const cmd = new AddLayerCommand({ layer: { id: 'ground', name: 'Ground copy', visible: true } })
      cmd.apply(scene)
      expect(ids(scene)).toStrictEqual(['ground'])
    })
  })
}
