import { Actor, type EventEmitter, Logger, Scene } from 'excalibur'
import { EditorModeComponent, PlacementIdComponent } from '../components/index.ts'
import { resolvePlacementDefinition } from '../entity/data-access.ts'
import { buildPlacementEntity } from '../entity/spawn-placement.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { SpriteSetResource } from '../resource/SpriteSetResource.ts'
import { areObjectsVisible } from '../services/editor-view.ts'
import {
  CameraControlSystem,
  InputSystem,
  ItemPickupSystem,
  ObjectSpawnSystem,
  PlayerSystem,
  PointerGestureSystem,
  SelectionHighlightSystem,
  TeleportSystem,
  TileEditorSystem,
  TriggerSystem,
  WalkOnTileSystem,
} from '../systems/index.ts'
import type { CharacterDefinition, EngineEventMap, EntityDefinition } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'

/**
 * Per-map scene. Composes the editor + runtime systems that
 * understand the new object-system schema:
 *
 * - {@link CameraControlSystem} (editor) — pan + zoom
 * - {@link TileEditorSystem} (editor) — tile painting / erasing
 * - {@link ObjectSpawnSystem} (runtime) — spawn entities from
 *   `MapData.objectPlacements`
 * - {@link PlayerSystem} (runtime) — spawn + drive the player actor
 *
 * Spawn-system order matters: `ObjectSpawnSystem` runs first so the
 * spawn-point entity exists in the world before `PlayerSystem`
 * queries for it.
 *
 * Session-state: each scene gets its own session-singleton entity
 * via `SessionState.ensure(this)` plus an `EditorModeComponent`
 * marker by default. The maker toggles `EditorModeComponent` ↔
 * `RuntimeModeComponent` via `Engine.setRuntimeMode()` to switch
 * between edit and playtest. See `docs/concepts/runtime-modes.md`
 * and `docs/concepts/editor-architecture.md`.
 */
export class MapScene extends Scene {
  private logger = Logger.getInstance()

  /** Project entity library — used to resolve `defId` placements at spawn time. */
  public readonly entityLibrary: readonly EntityDefinition[]

  constructor(
    public readonly mapResource: MapResource,
    events: EventEmitter<EngineEventMap>,
    entityLibrary: readonly EntityDefinition[] = [],
    playerCharacter?: CharacterDefinition,
    playerSpriteSet?: SpriteSetResource,
  ) {
    super()
    this.entityLibrary = entityLibrary
    // PointerGestureSystem must run before any consumer subscribes
    // to its events — it owns the raw `pointer.on('down/move/up')`
    // listeners that drive `POINTER_TAP` / `POINTER_DRAG_*`. Add
    // first so its `initialize` registers the producers ahead of the
    // tile-editor / camera consumers.
    this.world.add(new PointerGestureSystem(events))
    this.world.add(new CameraControlSystem(events))
    this.world.add(new TileEditorSystem(events))
    this.world.add(new SelectionHighlightSystem())
    this.world.add(new ObjectSpawnSystem(mapResource, entityLibrary))
    // InputSystem BEFORE PlayerSystem (insertion order = tick order at
    // equal priority): the player consumes the intent the same frame.
    this.world.add(new InputSystem())
    this.world.add(new PlayerSystem(mapResource, events, playerCharacter, playerSpriteSet))
    this.world.add(new TriggerSystem(events))
    this.world.add(new TeleportSystem(events))
    this.world.add(new ItemPickupSystem(events))
    this.world.add(new WalkOnTileSystem(mapResource, events))

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
    const entity = buildPlacementEntity(placement, def, this.mapResource, layersById)
    // Respect the global objects toggle for live spawns (place / undo).
    if (entity instanceof Actor && !areObjectsVisible(this)) entity.graphics.visible = false
    this.add(entity)
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
