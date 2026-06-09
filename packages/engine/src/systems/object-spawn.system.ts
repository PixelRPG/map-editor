import { type Scene, System, SystemType, type World } from 'excalibur'
import { buildPlacementEntity, resolvePlacementDefinition } from '../entity/spawn-placement.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { EntityDefinition } from '../types/data/index.ts'

/**
 * Walks `MapData.objectPlacements` on first scene activate and spawns one
 * Excalibur entity per placement. Composition is **registry-driven**: a
 * placement resolves to its {@link EntityDefinition} (inline or library +
 * overrides), and {@link buildPlacementEntity} instantiates the entity by
 * walking the definition's `components[]` through the component registry —
 * no per-kind switch. See `docs/concepts/entity-and-appearance-model.md`.
 *
 * Runs **once** at scene activate (a fresh `MapScene` + system per
 * `Engine.loadMap`). Entities persist for the scene's lifetime.
 */
export class ObjectSpawnSystem extends System {
  public readonly systemType = SystemType.Update

  constructor(
    private readonly mapResource: MapResource,
    private readonly entityLibrary: readonly EntityDefinition[] = [],
  ) {
    super()
  }

  public initialize(_world: World, scene: Scene): void {
    if (super.initialize) super.initialize(_world, scene)
    this.spawnAll(scene)
  }

  public update(_elapsed: number): void {
    // No per-frame work — entities live on the scene from initialize() onwards.
  }

  private spawnAll(scene: Scene): void {
    const mapData = this.mapResource.mapData
    if (!mapData?.objectPlacements?.length) return

    // Cache layers by id once so per-placement layer lookup is O(1).
    const layersById = new Map(mapData.layers.map((l) => [l.id, l]))

    for (const placement of mapData.objectPlacements) {
      const def = resolvePlacementDefinition(placement, this.entityLibrary)
      if (!def) continue
      scene.add(buildPlacementEntity(placement, def, this.mapResource, layersById))
    }
  }
}
