import { type EventEmitter, Logger, Scene } from 'excalibur'
import { EditorModeComponent } from '../components/index.ts'
import type { MapResource } from '../resource/MapResource.ts'
import {
  CameraControlSystem,
  ItemPickupSystem,
  ObjectSpawnSystem,
  PlayerSpawnSystem,
  TeleportSystem,
  TileEditorSystem,
  TriggerSystem,
  WalkOnTileSystem,
} from '../systems/index.ts'
import type { EngineEventMap, ObjectDefinition } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'

/**
 * Per-map scene. Composes the editor + runtime systems that
 * understand the new object-system schema:
 *
 * - {@link CameraControlSystem} (editor) — pan + zoom
 * - {@link TileEditorSystem} (editor) — tile painting / erasing
 * - {@link ObjectSpawnSystem} (runtime) — spawn entities from
 *   `MapData.objectPlacements`
 * - {@link PlayerSpawnSystem} (runtime) — resolve player spawn-point
 *
 * Spawn-system order matters: `ObjectSpawnSystem` runs first so the
 * spawn-point entity exists in the world before `PlayerSpawnSystem`
 * queries for it.
 *
 * Session-state: each scene gets its own session-singleton entity
 * via `SessionState.ensure(this)` plus an `EditorModeComponent`
 * marker by default. The maker (or the future runtime entry point)
 * mutates these markers to toggle Live Run / Test Run / Full Run.
 * See `docs/concepts/runtime-modes.md` and
 * `docs/concepts/editor-architecture.md`.
 */
export class MapScene extends Scene {
  private logger = Logger.getInstance()

  constructor(
    public readonly mapResource: MapResource,
    events: EventEmitter<EngineEventMap>,
    objectLibrary: readonly ObjectDefinition[] = [],
  ) {
    super()
    this.world.add(new CameraControlSystem())
    this.world.add(new TileEditorSystem(events))
    this.world.add(new ObjectSpawnSystem(mapResource, objectLibrary))
    this.world.add(new PlayerSpawnSystem(events))
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
}
