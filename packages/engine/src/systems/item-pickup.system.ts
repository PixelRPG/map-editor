import { type EventEmitter, Logger, type Scene, System, SystemType, type World } from 'excalibur'
import { ItemComponent } from '../components/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'

/**
 * Consumes `trigger-fired` events on entities with an
 * {@link ItemComponent} — emits a `item-picked-up` event with the
 * resolved \`itemId\`/\`qty\`, plays the optional pickup sound via
 * the audio bus, and removes the entity from the scene.
 *
 * Re-pickup prevention is the *trigger's* job: setting
 * `TriggerSpec.once: true` on the parent definition keeps
 * `TriggerSystem` from re-firing the trigger after the first
 * pickup. No additional state is needed on this system.
 *
 * Engine stays inventory-agnostic: the `item-picked-up` event
 * carries the bag of pickup data and project code decides what
 * "inventory" means.
 */
export class ItemPickupSystem extends System {
  public readonly systemType = SystemType.Update

  private world: World | null = null
  private scene: Scene | null = null
  private logger = Logger.getInstance()

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    this.world = world
    this.scene = scene

    this.events.on(EngineEvent.TRIGGER_FIRED, ({ entityId }) => {
      this.handleTrigger(entityId)
    })
  }

  public update(_elapsed: number): void {
    // Reactive — work happens in the event subscription.
  }

  private handleTrigger(entityId: number): void {
    if (!this.world || !this.scene) return
    const entity = this.world.entityManager.getById(entityId)
    if (!entity) return
    const item = entity.get(ItemComponent)
    if (!item) return

    this.events.emit(EngineEvent.ITEM_PICKED_UP, {
      itemId: item.itemId,
      qty: item.qty,
      pickupSound: item.pickupSound,
    })
    this.logger.info(`[ItemPickupSystem] picked up ${item.qty}× ${item.itemId}`)
    this.scene.world.entityManager.removeEntity(entity)
  }
}
