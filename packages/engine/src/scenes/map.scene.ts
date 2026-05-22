import { type EventEmitter, Logger, Scene } from 'excalibur'
import type { MapResource } from '../resource/MapResource.ts'
import {
  CameraControlSystem,
  ObjectSpawnSystem,
  PlayerSpawnSystem,
  TileEditorSystem,
  TriggerSystem,
} from '../systems/index.ts'
import type { EditorState, EngineEventMap, ObjectDefinition } from '../types/index.ts'

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
 */
export class MapScene extends Scene {
  private logger = Logger.getInstance()

  constructor(
    public readonly mapResource: MapResource,
    events: EventEmitter<EngineEventMap>,
    getEditorState: () => EditorState,
    objectLibrary: readonly ObjectDefinition[] = [],
  ) {
    super()
    this.world.add(new CameraControlSystem())
    this.world.add(new TileEditorSystem(events, getEditorState))
    this.world.add(new ObjectSpawnSystem(mapResource, objectLibrary))
    this.world.add(new PlayerSpawnSystem(events))
    this.world.add(new TriggerSystem(events))

    mapResource.addToScene(this)
    this.logger.debug('MapScene initialized')
  }
}
