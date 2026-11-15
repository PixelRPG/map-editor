/**
 * Apply/revert behaviour of `AddLayerCommand` and `RenameLayerCommand`
 * against a realised `MapScene`'s `MapData.layers`. The layer list and
 * every layer's name are document state, so both ride a Command (peers
 * + undo). `revert` must restore exactly what was there before,
 * leaving the pre-existing layers intact.
 */

import { describe, expect, it } from '@gjsify/unit'

import { MapScene } from '../scenes/map.scene.ts'
import type { LayerData } from '../types/data/index.ts'
import { AddLayerCommand, RenameLayerCommand } from './layer-lifecycle.command.ts'

/** Duck-typed `MapScene` (no engine wiring) holding a mutable layer list. */
function makeScene(layers: LayerData[]): MapScene {
  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, { mapResource: { mapData: { layers } } })
  return scene
}

function layersOf(scene: MapScene): LayerData[] {
  // biome-ignore lint/suspicious/noExplicitAny: test reads the stubbed mapData
  return (scene as any).mapResource.mapData.layers as LayerData[]
}

function ids(scene: MapScene): string[] {
  return layersOf(scene).map((l) => l.id)
}

function names(scene: MapScene): string[] {
  return layersOf(scene).map((l) => l.name)
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

  await describe('RenameLayerCommand', async () => {
    await it('writes the new name; revert restores the previous one', async () => {
      const scene = makeScene([{ id: 'decor', name: 'Decor', visible: true }])
      const cmd = new RenameLayerCommand({ layerId: 'decor', name: 'Treetops', previousName: 'Decor' })

      cmd.apply(scene)
      expect(names(scene)).toStrictEqual(['Treetops'])

      cmd.revert(scene)
      expect(names(scene)).toStrictEqual(['Decor'])
    })

    await it('leaves every other layer alone', async () => {
      const scene = makeScene([
        { id: 'a', name: 'A', visible: true },
        { id: 'b', name: 'B', visible: true },
      ])
      new RenameLayerCommand({ layerId: 'b', name: 'Bee', previousName: 'B' }).apply(scene)
      expect(names(scene)).toStrictEqual(['A', 'Bee'])
    })

    await it('skips an unknown layer id instead of throwing', async () => {
      const scene = makeScene([{ id: 'a', name: 'A', visible: true }])
      new RenameLayerCommand({ layerId: 'gone', name: 'X', previousName: 'Y' }).apply(scene)
      expect(names(scene)).toStrictEqual(['A'])
    })
  })
}
