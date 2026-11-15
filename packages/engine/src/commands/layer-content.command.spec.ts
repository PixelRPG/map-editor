/**
 * `DuplicateLayerCommand` / `RemoveLayerCommand` against a duck-typed
 * `MapScene` holding real plane tilemaps + shadows. Both carry a
 * layer's whole CONTENT, so what these pin is that apply/revert leave
 * the LIST, the plane SHADOW and the PLACEMENTS all agreeing — the
 * failure these commands exist to prevent is a deleted layer whose
 * tiles keep drawing or whose placements outlive it as orphans.
 */

import { describe, expect, it } from '@gjsify/unit'
import { TileMap } from 'excalibur'

import { MapEditorComponent } from '../components/map-editor.component.ts'
import { TileMapPlaneComponent } from '../components/tilemap-plane.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { getSpritesAt, setSpritesAt } from '../services/map-editor-shadow.service.ts'
import type { LayerData, LayerPlane, ObjectPlacement } from '../types/data/index.ts'
import { DuplicateLayerCommand, type LayerContentPayload, RemoveLayerCommand } from './layer-content.command.ts'

interface Fixture {
  scene: MapScene
  layers: LayerData[]
  placements: ObjectPlacement[]
  editors: Record<LayerPlane, MapEditorComponent>
  /** Placement ids passed to `spawnPlacement` / `despawnPlacement`, in order. */
  spawned: string[]
  despawned: string[]
}

const DECOR: ObjectPlacement = { id: 'p1', layerId: 'decor', tileX: 2, tileY: 3, defId: 'apple' }

/**
 * Layers `bg` (ground) and `decor` (hero), one real tilemap + shadow per
 * plane, two `decor` sprites in the hero shadow and one `decor`
 * placement on the map.
 */
function makeScene(): Fixture {
  const layers: LayerData[] = [
    { id: 'bg', name: 'Background', visible: true, plane: 'ground' },
    { id: 'decor', name: 'Decor', visible: true, plane: 'hero' },
  ]
  const placements: ObjectPlacement[] = [{ ...DECOR }]
  const mapResource = {
    mapData: { columns: 4, rows: 4, layers, objectPlacements: placements },
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
  setSpritesAt(editors.hero, 2, 0, 'decor', [{ spriteSetId: 'tiles', spriteId: 7 }])
  setSpritesAt(editors.ground, 1, 1, 'bg', [{ spriteSetId: 'tiles', spriteId: 1 }])

  const spawned: string[] = []
  const despawned: string[] = []
  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, {
    mapResource,
    world: { entityManager: { entities: tileMaps } },
    spawnPlacement: (p: ObjectPlacement) => spawned.push(p.id),
    despawnPlacement: (id: string) => despawned.push(id),
  })
  return { scene, layers, placements, editors, spawned, despawned }
}

const ids = (layers: LayerData[]) => layers.map((l) => l.id)

/**
 * Read the placement ids back THROUGH the map rather than through the
 * array the fixture seeded: `detachPlacement` reassigns
 * `mapData.objectPlacements` to a filtered copy, so a captured
 * reference would report a stale list.
 */
function placementIds(scene: MapScene): string[] {
  // biome-ignore lint/suspicious/noExplicitAny: test reads the stubbed mapData
  return (((scene as any).mapResource.mapData.objectPlacements ?? []) as ObjectPlacement[]).map((p) => p.id)
}

/** The payload a caller builds for the `decor` layer — content and all. */
function decorContent(overrides: Partial<LayerContentPayload> = {}): LayerContentPayload {
  return {
    layer: {
      id: 'decor',
      name: 'Decor',
      visible: true,
      plane: 'hero',
      sprites: [
        { x: 1, y: 1, spriteSetId: 'tiles', spriteId: 4 },
        { x: 2, y: 0, spriteSetId: 'tiles', spriteId: 7 },
      ],
    },
    index: 1,
    placements: [{ ...DECOR }],
    ...overrides,
  }
}

export default async () => {
  await describe('RemoveLayerCommand', async () => {
    await it('drops the layer, clears its shadow cells and despawns its placements', async () => {
      const { scene, layers, editors, despawned } = makeScene()
      new RemoveLayerCommand(decorContent()).apply(scene)

      expect(ids(layers)).toStrictEqual(['bg'])
      expect(getSpritesAt(editors.hero, 1, 1, 'decor')).toStrictEqual([])
      expect(getSpritesAt(editors.hero, 2, 0, 'decor')).toStrictEqual([])
      expect(despawned).toStrictEqual(['p1'])
      expect(placementIds(scene)).toStrictEqual([])
      // A sibling layer's tiles on a shared plane cell are untouched.
      expect(getSpritesAt(editors.ground, 1, 1, 'bg').map((r) => r.spriteId)).toStrictEqual([1])
    })

    await it('revert puts the layer back at its index with tiles and placements', async () => {
      const { scene, layers, editors, spawned } = makeScene()
      const cmd = new RemoveLayerCommand(decorContent())
      cmd.apply(scene)
      cmd.revert(scene)

      expect(ids(layers)).toStrictEqual(['bg', 'decor'])
      expect(getSpritesAt(editors.hero, 1, 1, 'decor').map((r) => r.spriteId)).toStrictEqual([4])
      expect(getSpritesAt(editors.hero, 2, 0, 'decor').map((r) => r.spriteId)).toStrictEqual([7])
      expect(spawned).toStrictEqual(['p1'])
      expect(placementIds(scene)).toStrictEqual(['p1'])
    })

    await it('is idempotent — a second apply leaves the list alone', async () => {
      const { scene, layers } = makeScene()
      const cmd = new RemoveLayerCommand(decorContent())
      cmd.apply(scene)
      cmd.apply(scene)
      expect(ids(layers)).toStrictEqual(['bg'])
    })
  })

  await describe('DuplicateLayerCommand', async () => {
    await it('attaches the copy with its own tiles and placements', async () => {
      const { scene, layers, editors, spawned } = makeScene()
      new DuplicateLayerCommand({
        layer: { ...decorContent().layer, id: 'decor-copy', name: 'Decor copy' },
        index: 2,
        placements: [{ ...DECOR, id: 'p2', layerId: 'decor-copy' }],
      }).apply(scene)

      expect(ids(layers)).toStrictEqual(['bg', 'decor', 'decor-copy'])
      expect(getSpritesAt(editors.hero, 1, 1, 'decor-copy').map((r) => r.spriteId)).toStrictEqual([4])
      // The original's refs on the same cell survive the copy.
      expect(getSpritesAt(editors.hero, 1, 1, 'decor').map((r) => r.spriteId)).toStrictEqual([4])
      expect(spawned).toStrictEqual(['p2'])
    })

    await it('revert removes the copy, leaving the original intact', async () => {
      const { scene, layers, editors } = makeScene()
      const cmd = new DuplicateLayerCommand({
        layer: { ...decorContent().layer, id: 'decor-copy', name: 'Decor copy' },
        index: 2,
        placements: [{ ...DECOR, id: 'p2', layerId: 'decor-copy' }],
      })
      cmd.apply(scene)
      cmd.revert(scene)

      expect(ids(layers)).toStrictEqual(['bg', 'decor'])
      expect(getSpritesAt(editors.hero, 1, 1, 'decor-copy')).toStrictEqual([])
      expect(getSpritesAt(editors.hero, 1, 1, 'decor').map((r) => r.spriteId)).toStrictEqual([4])
      expect(getSpritesAt(editors.hero, 2, 0, 'decor').map((r) => r.spriteId)).toStrictEqual([7])
    })

    await it('is idempotent — a replayed apply does not duplicate the layer', async () => {
      const { scene, layers, spawned } = makeScene()
      const cmd = new DuplicateLayerCommand({
        layer: { ...decorContent().layer, id: 'decor-copy', name: 'Decor copy' },
        index: 2,
        placements: [{ ...DECOR, id: 'p2', layerId: 'decor-copy' }],
      })
      cmd.apply(scene)
      cmd.apply(scene)
      expect(ids(layers)).toStrictEqual(['bg', 'decor', 'decor-copy'])
      expect(spawned).toStrictEqual(['p2'])
    })
  })
}
