/**
 * Apply/revert behaviour of `PlaceObjectCommand` / `RemoveObjectCommand`
 * at the data level: `mapData.objectPlacements` is the persisted +
 * collab-synced source of truth the commands mutate. Live entity
 * spawn/despawn rides the same code path but resolves through the
 * entity library — with an empty library the spawn half no-ops, which
 * keeps these tests free of graphics/runtime scaffolding.
 */

import { describe, expect, it } from '@gjsify/unit'
import type { Scene } from 'excalibur'

import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import type { ObjectPlacement } from '../types/data/index.ts'
import { PlaceObjectCommand, RemoveObjectCommand } from './object-placement.command.ts'

interface PlacementFixture {
  scene: MapScene
  placements: () => ObjectPlacement[]
}

/**
 * Duck-typed `MapScene` (via `Object.create` so `instanceof MapScene`
 * holds without the constructor's engine wiring). `spawnPlacement` /
 * `despawnPlacement` are the real prototype methods: the empty
 * `entityLibrary` makes spawn resolve to null (no-op) and despawn
 * iterates the empty world.
 */
function makePlacementScene(initial: ObjectPlacement[] = []): PlacementFixture {
  const mapData = {
    layers: [{ id: 'l1', name: 'L', visible: true }],
    objectPlacements: [...initial],
  }
  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, {
    mapResource: { mapData } as unknown as MapResource,
    entityLibrary: [],
    world: { entityManager: { entities: [] } },
  })
  return { scene, placements: () => scene.mapResource.mapData?.objectPlacements ?? [] }
}

function makePlacement(id: string, tileX = 1, tileY = 2): ObjectPlacement {
  return { id, layerId: 'l1', tileX, tileY, defId: 'crate' }
}

export default async () => {
  await describe('PlaceObjectCommand — apply/revert', async () => {
    await it('apply appends the placement to mapData.objectPlacements', async () => {
      const fixture = makePlacementScene()
      new PlaceObjectCommand({ placement: makePlacement('p1') }).apply(fixture.scene)

      expect(fixture.placements().map((p) => p.id)).toStrictEqual(['p1'])
    })

    await it('apply replaces an existing placement with the same id (no duplicate)', async () => {
      const fixture = makePlacementScene([makePlacement('p1', 0, 0)])
      new PlaceObjectCommand({ placement: makePlacement('p1', 3, 3) }).apply(fixture.scene)

      expect(fixture.placements().length).toBe(1)
      expect(fixture.placements()[0].tileX).toBe(3)
    })

    await it('revert removes the placed object again', async () => {
      const fixture = makePlacementScene([makePlacement('keep')])
      const command = new PlaceObjectCommand({ placement: makePlacement('p1') })
      command.apply(fixture.scene)
      command.revert(fixture.scene)

      expect(fixture.placements().map((p) => p.id)).toStrictEqual(['keep'])
    })

    await it('is a no-op on a non-MapScene scene (defensive)', async () => {
      const command = new PlaceObjectCommand({ placement: makePlacement('p1') })
      // Plain object scene — apply/revert must not throw.
      command.apply({} as Scene)
      command.revert({} as Scene)
    })
  })

  await describe('RemoveObjectCommand — apply/revert', async () => {
    await it('apply removes exactly the targeted placement', async () => {
      const fixture = makePlacementScene([makePlacement('p1'), makePlacement('p2')])
      new RemoveObjectCommand({ placement: makePlacement('p1') }).apply(fixture.scene)

      expect(fixture.placements().map((p) => p.id)).toStrictEqual(['p2'])
    })

    await it('revert restores the captured placement (remove → undo round-trip)', async () => {
      const fixture = makePlacementScene([makePlacement('p1'), makePlacement('p2')])
      const command = new RemoveObjectCommand({ placement: makePlacement('p1') })
      command.apply(fixture.scene)
      command.revert(fixture.scene)

      expect(
        fixture
          .placements()
          .map((p) => p.id)
          .sort(),
      ).toStrictEqual(['p1', 'p2'])
    })
  })
}
