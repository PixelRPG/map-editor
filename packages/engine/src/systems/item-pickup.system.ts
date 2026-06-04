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
 *
 * Stateless system — the world + scene references stay captured in
 * the `TRIGGER_FIRED` subscription closure installed at `initialize`,
 * never on the system instance.
 */
export class ItemPickupSystem extends System {
  public readonly systemType = SystemType.Update

  private readonly logger = Logger.getInstance()

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)

    this.events.on(EngineEvent.TRIGGER_FIRED, ({ entityId }) => {
      const entity = world.entityManager.getById(entityId)
      if (!entity) return
      const item = entity.get(ItemComponent)
      if (!item) return

      this.events.emit(EngineEvent.ITEM_PICKED_UP, {
        itemId: item.itemId,
        qty: item.qty,
        pickupSound: item.pickupSound,
      })
      this.logger.info(`[ItemPickupSystem] picked up ${item.qty}× ${item.itemId}`)
      scene.world.entityManager.removeEntity(entity)
    })
  }

  public update(_elapsed: number): void {
    // Reactive — work happens in the event subscription.
  }
}
