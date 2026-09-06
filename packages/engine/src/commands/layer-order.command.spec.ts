/**
 * `ReorderLayerCommand` / `SetLayerPlaneCommand` against a duck-typed
 * `MapScene` holding real plane tilemaps + shadows. Both are document
 * state (the list order is the within-plane depth, the plane is the
 * cross-plane depth), so both ride the op-log; what these pin is that
 * apply/revert leave the LIST, the PLANE FIELD, the SHADOW and the
 * placement actors' z all agreeing — the change of plane is the one
 * command that touches all four.
 */

import { describe, expect, it } from '@gjsify/unit'
import { Actor, TileMap } from 'excalibur'

import { MapEditorComponent } from '../components/map-editor.component.ts'
import { TileTransformComponent } from '../components/tile-transform.component.ts'
import { TileMapPlaneComponent, zFor } from '../components/tilemap-plane.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { getSpritesAt, setSpritesAt } from '../services/map-editor-shadow.service.ts'
import type { LayerData, LayerPlane } from '../types/data/index.ts'
import { ReorderLayerCommand, SetLayerPlaneCommand } from './layer-order.command.ts'

interface Fixture {
  scene: MapScene
  layers: LayerData[]
  editors: Record<LayerPlane, MapEditorComponent>
  decorActor: Actor
}

/**
 * Layers `bg` (ground) and `decor` (hero), one real tilemap + shadow per
 * plane, one `decor` sprite at (1,1) in the hero shadow, and one
 * placement actor on `decor` at the hero z.
 */
function makeScene(layers?: LayerData[]): Fixture {
  const list: LayerData[] = layers ?? [
    { id: 'bg', name: 'Background', visible: true, plane: 'ground' },
    { id: 'decor', name: 'Decor', visible: true, plane: 'hero' },
  ]
  const mapResource = {
    mapData: { columns: 4, rows: 4, layers: list },
    getSpriteSetResource: () => undefined,
    refreshTileSolidFromEditor: () => {},
    // biome-ignore lint/suspicious/noExplicitAny: test stub mirrors only the surface the commands exercise
  } as any as MapResource

  const editors = {} as Record<LayerPlane, MapEditorComponent>
  const tileMaps: TileMap[] = []
  for (const plane of ['ground', 'hero', 'overlay'] as const) {
    const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: 4, rows: 4 })
    tileMap.addComponent(new TileMapPlaneComponent(plane))
    const editor = new MapEditorComponent()
    tileMap.addComponent(editor)
    editors[plane] = editor
    tileMaps.push(tileMap)
  }
  setSpritesAt(editors.hero, 1, 1, 'decor', [{ spriteSetId: 'tiles', spriteId: 4 }])

  const decorActor = new Actor({ x: 24, y: 24 })
  decorActor.addComponent(new TileTransformComponent(1, 1, 'decor'))
  decorActor.z = zFor('hero')

  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, { mapResource, world: { entityManager: { entities: [...tileMaps, decorActor] } } })
  return { scene, layers: list, editors, decorActor }
}

const ids = (layers: LayerData[]) => layers.map((l) => l.id)

export default async () => {
  await describe('ReorderLayerCommand', async () => {
    await it('moves the layer to `index`; revert moves it back', async () => {
      const { scene, layers } = makeScene([
        { id: 'a', name: 'A', visible: true },
        { id: 'b', name: 'B', visible: true },
        { id: 'c', name: 'C', visible: true },
      ])
      const cmd = new ReorderLayerCommand({ layerId: 'a', index: 2, previousIndex: 0 })
      cmd.apply(scene)
      expect(ids(layers)).toStrictEqual(['b', 'c', 'a'])
      cmd.revert(scene)
      expect(ids(layers)).toStrictEqual(['a', 'b', 'c'])
    })

    await it('is idempotent — applying twice leaves the layer at `index`', async () => {
      const { scene, layers } = makeScene([
        { id: 'a', name: 'A', visible: true },
        { id: 'b', name: 'B', visible: true },
      ])
      const cmd = new ReorderLayerCommand({ layerId: 'a', index: 1, previousIndex: 0 })
      cmd.apply(scene)
      cmd.apply(scene)
      expect(ids(layers)).toStrictEqual(['b', 'a'])
    })

    await it('skips an unknown layer id without touching the list', async () => {
      const { scene, layers } = makeScene()
      const before = ids(layers)
      const originalWarn = console.warn
      console.warn = () => {}
      try {
        new ReorderLayerCommand({ layerId: 'ghost', index: 0, previousIndex: 1 }).apply(scene)
      } finally {
        console.warn = originalWarn
      }
      expect(ids(layers)).toStrictEqual(before)
    })
  })

  await describe('SetLayerPlaneCommand', async () => {
    await it('writes the plane, moves the layer, and carries its sprites to the new plane tilemap', async () => {
      const { scene, layers, editors } = makeScene()
      const cmd = new SetLayerPlaneCommand({
        layerId: 'decor',
        plane: 'ground',
        previousPlane: 'hero',
        index: 0,
        previousIndex: 1,
      })
      cmd.apply(scene)

      expect(layers.find((l) => l.id === 'decor')?.plane).toBe('ground')
      expect(ids(layers)).toStrictEqual(['decor', 'bg'])
      expect(getSpritesAt(editors.hero, 1, 1, 'decor')).toStrictEqual([])
      expect(getSpritesAt(editors.ground, 1, 1, 'decor').map((r) => r.spriteId)).toStrictEqual([4])
    })

    await it('revert restores the previous plane, position and sprites', async () => {
      const { scene, layers, editors } = makeScene()
      const cmd = new SetLayerPlaneCommand({
        layerId: 'decor',
        plane: 'overlay',
        previousPlane: 'hero',
        index: 1,
        previousIndex: 1,
      })
      cmd.apply(scene)
      cmd.revert(scene)

      expect(layers.find((l) => l.id === 'decor')?.plane).toBe('hero')
      expect(ids(layers)).toStrictEqual(['bg', 'decor'])
      expect(getSpritesAt(editors.overlay, 1, 1, 'decor')).toStrictEqual([])
      expect(getSpritesAt(editors.hero, 1, 1, 'decor').map((r) => r.spriteId)).toStrictEqual([4])
    })

    await it('re-pins the z of placement actors on the layer', async () => {
      const { scene, decorActor } = makeScene()
      const cmd = new SetLayerPlaneCommand({
        layerId: 'decor',
        plane: 'overlay',
        previousPlane: 'hero',
        index: 1,
        previousIndex: 1,
      })
      cmd.apply(scene)
      expect(decorActor.z).toBe(zFor('overlay'))
      cmd.revert(scene)
      expect(decorActor.z).toBe(zFor('hero'))
    })

    await it('revert of a plane-less legacy layer removes the key again (no `plane: undefined` in the file)', async () => {
      const { scene, layers } = makeScene([{ id: 'legacy', name: 'Legacy', visible: true }])
      const cmd = new SetLayerPlaneCommand({
        layerId: 'legacy',
        plane: 'hero',
        previousPlane: undefined,
        index: 0,
        previousIndex: 0,
      })
      cmd.apply(scene)
      expect(layers[0].plane).toBe('hero')
      cmd.revert(scene)
      expect('plane' in layers[0]).toBe(false)
    })
  })
}
