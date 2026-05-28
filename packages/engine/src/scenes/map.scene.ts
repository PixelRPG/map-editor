import { type EventEmitter, Logger, Scene } from 'excalibur'
import { EditorModeComponent } from '../components/index.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { SpriteSetResource } from '../resource/SpriteSetResource.ts'
import {
  CameraControlSystem,
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
import type { CharacterDefinition, EngineEventMap, ObjectDefinition } from '../types/index.ts'
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

  constructor(
    public readonly mapResource: MapResource,
    events: EventEmitter<EngineEventMap>,
    objectLibrary: readonly ObjectDefinition[] = [],
    playerCharacter?: CharacterDefinition,
    playerSpriteSet?: SpriteSetResource,
  ) {
    super()
    // PointerGestureSystem must run before any consumer subscribes
    // to its events — it owns the raw `pointer.on('down/move/up')`
    // listeners that drive `POINTER_TAP` / `POINTER_DRAG_*`. Add
    // first so its `initialize` registers the producers ahead of the
    // tile-editor / camera consumers.
    this.world.add(new PointerGestureSystem(events))
    this.world.add(new CameraControlSystem(events))
    this.world.add(new TileEditorSystem(events))
    this.world.add(new SelectionHighlightSystem())
    this.world.add(new ObjectSpawnSystem(mapResource, objectLibrary))
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
}
