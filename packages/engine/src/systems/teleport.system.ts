import { type EventEmitter, Logger, type Scene, System, SystemType, type World } from 'excalibur'
import { TeleportComponent } from '../components/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'

/**
 * Reacts to `trigger-fired` events whose firing entity carries a
 * {@link TeleportComponent} by emitting an engine-level "switch to
 * target map" intent.
 *
 * **Why not call `engine.loadMap` directly?**
 * The system has no reference to the engine. We emit a
 * `MAP_LOADED`-shaped event with the destination payload and let
 * the engine itself (the only owner of scene-switching) react. That
 * keeps systems decoupled from the engine class and keeps the
 * "scene switch" decision atomic from the engine's perspective —
 * a single ingress point for save-state, transition animation, etc.
 *
 * The host engine should listen for the dedicated
 * `'teleport-requested'` event the system emits and call
 * `Engine.loadMap(targetMapId)` + reposition the player at the
 * target tile. Until that wiring lands in the host, the system
 * logs the requested teleport for visibility.
 */
export class TeleportSystem extends System {
  public readonly systemType = SystemType.Update

  private world: World | null = null
  private logger = Logger.getInstance()

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    this.world = world

    this.events.on(EngineEvent.TRIGGER_FIRED, ({ entityId }) => {
      this.handleTrigger(entityId)
    })
  }

  public update(_elapsed: number): void {
    // Reactive — work happens in the event subscription installed in initialize().
  }

  private handleTrigger(entityId: number): void {
    if (!this.world) return
    const entity = this.world.entityManager.getById(entityId)
    if (!entity) return
    const teleport = entity.get(TeleportComponent)
    if (!teleport) return

    this.events.emit(EngineEvent.TELEPORT_REQUESTED, {
      targetMapId: teleport.targetMapId,
      targetTileX: teleport.targetTileX,
      targetTileY: teleport.targetTileY,
      facing: teleport.facing,
    })
    this.logger.info(
      `[TeleportSystem] teleport requested → ${teleport.targetMapId} (${teleport.targetTileX}, ${teleport.targetTileY})`,
    )
  }
}
