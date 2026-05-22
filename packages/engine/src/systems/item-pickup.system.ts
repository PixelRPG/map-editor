import { type EventEmitter, Logger, type Scene, System, SystemType, type World } from 'excalibur'
import { ItemComponent, TriggerComponent } from '../components/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'

/**
 * Consumes `trigger-fired` events on entities with an
 * {@link ItemComponent} — emits a `item-picked-up` event with the
 * resolved \`itemId\`/\`qty\`, plays the optional pickup sound via
 * the audio bus, and removes the entity from the scene unless
 * `oncePerScene` is set (in which case the entity persists with
 * \`TriggerComponent.fired = true\` and re-walking onto it is a
 * no-op until the scene reloads).
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

    if (item.oncePerScene) {
      // Leave the entity in place but mark its trigger spent — it
      // already is via TriggerSystem, but keeping the entity also
      // lets the editor highlight "already-collected" placements
      // when save-state lands.
      const trigger = entity.get(TriggerComponent)
      if (trigger) trigger.fired = true
      return
    }
    this.scene.world.entityManager.removeEntity(entity)
  }
}
