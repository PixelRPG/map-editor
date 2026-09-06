import { Actor, type EventEmitter, Logger, Scene } from 'excalibur'
import { EditorModeComponent, PlacementIdComponent } from '../components/index.ts'
import type { ComponentSpecRegistry } from '../entity/component-spec.ts'
import { resolvePlacementDefinition } from '../entity/data-access.ts'
import { BUILT_IN_COMPONENT_SPECS } from '../entity/registry.ts'
import { applyPlacementGraphic, buildPlacementEntity } from '../entity/spawn-placement.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { SpriteSetResource } from '../resource/SpriteSetResource.ts'
import { areObjectsVisible } from '../services/editor-view.ts'
import type { GameSystemSpec } from '../game-systems/game-system-spec.ts'
import {
  CameraControlSystem,
  ObjectSpawnSystem,
  PointerGestureSystem,
  SelectionHighlightSystem,
  TileEditorSystem,
} from '../systems/index.ts'
import type { CharacterDefinition, EngineEventMap, EntityDefinition } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'

/**
 * Everything a scene needs beyond its map + event bus. An options bag
 * rather than positional arguments because the game-system list and its
 * per-system config would otherwise push the constructor to seven
 * parameters.
 */
export interface MapSceneOptions {
  /** Project entity library — resolves `defId` placements at spawn time. */
  entityLibrary?: readonly EntityDefinition[]
  /** The resolved player definition, when the project names one. */
  playerCharacter?: CharacterDefinition
  /** The player's sprite set, when it resolved. */
  playerSpriteSet?: SpriteSetResource
  /**
   * The game systems this project runs — normally
   * `effectiveGameSystems(projectData)`. Each contributes its ECS
   * systems after the editor's own. Defaults to none, which yields a
   * scene you can edit but not play: the caller that has the project
   * decides what is switched on.
   */
  gameSystems?: readonly GameSystemSpec[]
  /** Per-system settings (`GameProjectData.gameSystems[id].config`). */
  gameSystemConfig?: Readonly<Record<string, Record<string, unknown>>>
  /**
   * The components this project may build — normally
   * `effectiveComponentRegistry(projectData)`. Used by the spawn paths
   * so a component whose game system is off stays dormant rather than
   * being instantiated. Defaults to every built-in.
   */
  componentRegistry?: ComponentSpecRegistry
}

/**
 * Per-map scene. Composes two layers of ECS systems:
 *
 * 1. The **editor's own** — pointer gestures, camera, the tile editor,
 *    selection highlighting and placement spawning. Always present,
 *    whatever the project switched on: they are how the editor works,
 *    not rules of the game.
 * 2. The **game systems'** — each effective {@link GameSystemSpec}
 *    contributes its ECS systems through `runtime(ctx)`, in registry
 *    order, appended after the editor's. That is the seam a new game
 *    system plugs into: a registration, not an edit here.
 *
 * Spawn-system order matters: `ObjectSpawnSystem` is in layer 1 and
 * therefore runs before `PlayerSystem` (layer 2), so the spawn-point
 * entity exists in the world before the player queries for it.
 *
 * Session-state: each scene gets its own session-singleton entity
 * via `SessionState.ensure(this)` plus an `EditorModeComponent`
 * marker by default. The maker toggles `EditorModeComponent` ↔
 * `RuntimeModeComponent` via `Engine.setRuntimeMode()` to switch
 * between edit and playtest. See `docs/concepts/runtime-modes.md`,
 * `docs/concepts/editor-architecture.md` and
 * `docs/concepts/game-systems.md`.
 */
export class MapScene extends Scene {
  private logger = Logger.getInstance()

  /** Project entity library — used to resolve `defId` placements at spawn time. */
  public readonly entityLibrary: readonly EntityDefinition[]

  /** The components this scene may build — see {@link MapSceneOptions.componentRegistry}. */
  public readonly componentRegistry: ComponentSpecRegistry

  constructor(
    public readonly mapResource: MapResource,
    events: EventEmitter<EngineEventMap>,
    options: MapSceneOptions = {},
  ) {
    super()
    this.entityLibrary = options.entityLibrary ?? []
    this.componentRegistry = options.componentRegistry ?? BUILT_IN_COMPONENT_SPECS
    // PointerGestureSystem must run before any consumer subscribes
    // to its events — it owns the raw `pointer.on('down/move/up')`
    // listeners that drive `POINTER_TAP` / `POINTER_DRAG_*`. Add
    // first so its `initialize` registers the producers ahead of the
    // tile-editor / camera consumers.
    this.world.add(new PointerGestureSystem(events))
    this.world.add(new CameraControlSystem(events))
    this.world.add(new TileEditorSystem(events))
    this.world.add(new SelectionHighlightSystem())
    this.world.add(new ObjectSpawnSystem(mapResource, this.entityLibrary, this.componentRegistry))

    for (const spec of options.gameSystems ?? []) {
      const ctx = {
        events,
        mapResource,
        entityLibrary: this.entityLibrary,
        config: options.gameSystemConfig?.[spec.id] ?? {},
        componentRegistry: this.componentRegistry,
        playerCharacter: options.playerCharacter,
        playerSpriteSet: options.playerSpriteSet,
      }
      for (const system of spec.runtime(ctx)) this.world.add(system)
    }

    // Bootstrap the session-singleton + default to editor mode.
    // Hosts that want to start in pure runtime (Full Run window) can
    // call `SessionState.unset(scene, EditorModeComponent)` and add a
    // `RuntimeModeComponent` right after construction.
    SessionState.set(this, new EditorModeComponent())

    mapResource.addToScene(this)
    this.logger.debug('MapScene initialized')
  }

  /**
   * Spawn a single placement live (used by `PlaceObjectCommand` / the undo
   * of a remove). Resolves the placement's definition through the entity
   * library + builds the entity via the component registry — same path as
   * the bulk `ObjectSpawnSystem`. No-op if the definition can't resolve.
   */
  spawnPlacement(placement: import('../types/data/index.ts').ObjectPlacement): void {
    const mapData = this.mapResource.mapData
    if (!mapData) return
    const def = resolvePlacementDefinition(placement, this.entityLibrary)
    if (!def) return
    const layersById = new Map(mapData.layers.map((l) => [l.id, l]))
    const entity = buildPlacementEntity(placement, def, this.mapResource, layersById, this.componentRegistry)
    // Respect the global objects toggle for live spawns (place / undo).
    if (entity instanceof Actor && !areObjectsVisible(this)) entity.graphics.visible = false
    this.add(entity)
  }

  /**
   * Rebuild every placement actor's graphic for editor vs runtime mode.
   * In runtime the editor cell frame + logic markers (spawn-point /
   * teleport / trigger diamonds) are dropped so a playtest shows only
   * the real sprites; switching back restores the editor chrome. Called
   * by `Engine.setRuntimeMode`.
   */
  refreshPlacementGraphicsForMode(runtime: boolean): void {
    const placements = this.mapResource.mapData?.objectPlacements ?? []
    const byId = new Map(placements.map((p) => [p.id, p]))
    for (const entity of this.world.entityManager.entities) {
      if (!(entity instanceof Actor)) continue
      const placementId = entity.get(PlacementIdComponent)?.id
      if (!placementId) continue
      const placement = byId.get(placementId)
      if (!placement) continue
      const def = resolvePlacementDefinition(placement, this.entityLibrary)
      if (!def) continue
      applyPlacementGraphic(entity, def, this.mapResource, this.componentRegistry, { runtime })
    }
  }

  /** Despawn the live entity for a placement id (used by `RemoveObjectCommand`). */
  despawnPlacement(placementId: string): void {
    for (const entity of [...this.world.entityManager.entities]) {
      if (entity.get(PlacementIdComponent)?.id === placementId) {
        entity.kill()
        this.world.remove(entity, false)
      }
    }
  }
}
