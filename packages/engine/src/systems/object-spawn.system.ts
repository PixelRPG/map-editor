import { Actor, Logger, type Scene, System, SystemType, type World } from 'excalibur'
import type { ComponentSpecRegistry } from '../entity/component-spec.ts'
import { resolvePlacementDefinition } from '../entity/data-access.ts'
import { BUILT_IN_COMPONENT_SPECS } from '../entity/registry.ts'
import { buildPlacementEntity, placementSpawnWarnings } from '../entity/spawn-placement.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { areObjectsVisible } from '../services/editor-view.ts'
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
  private readonly logger = Logger.getInstance()

  constructor(
    private readonly mapResource: MapResource,
    private readonly entityLibrary: readonly EntityDefinition[] = [],
    /**
     * The components this project may use — normally
     * `effectiveComponentRegistry(projectData)`. A component whose game
     * system is switched off is absent from it and is therefore skipped
     * at build time: dormant, not missing.
     */
    private readonly registry: ComponentSpecRegistry = BUILT_IN_COMPONENT_SPECS,
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

    const objectsVisible = areObjectsVisible(scene)
    for (const placement of mapData.objectPlacements) {
      const def = resolvePlacementDefinition(placement, this.entityLibrary)
      // Surface integrity gaps (dangling defId, incomplete required fields)
      // instead of silently skipping — these used to vanish without a trace.
      for (const warning of placementSpawnWarnings(placement, def, this.registry)) {
        this.logger.warn(`[ObjectSpawnSystem] ${warning}`)
      }
      if (!def) continue
      const entity = buildPlacementEntity(placement, def, this.mapResource, layersById, this.registry)
      // Respect the global objects toggle (Layers tab "Objects" row).
      if (entity instanceof Actor && !objectsVisible) entity.graphics.visible = false
      scene.add(entity)
    }
  }
}
