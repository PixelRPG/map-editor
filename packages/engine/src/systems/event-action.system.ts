import { type EventEmitter, Logger, type Scene, System, SystemType, type World } from 'excalibur'
import { EventActionsComponent } from '../components/index.ts'
import type { ActionData } from '../types/data/ActionData.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'

/**
 * Executes an event's ordered {@link ActionData} list when its trigger
 * fires — the runtime half of the event-scripting system (the authoring
 * half is the `actions` component + Objects editor).
 *
 * On `TRIGGER_FIRED` it looks up the firing entity's
 * {@link EventActionsComponent} and runs each action in order, mapping it
 * onto an engine-level intent event — reusing `TELEPORT_REQUESTED` /
 * `ITEM_PICKED_UP` (so existing host wiring + the atlas teleport overlay
 * keep working) and emitting the new `SHOW_TEXT_REQUESTED` / `FLAG_SET` /
 * `PLAY_SFX_REQUESTED` for the rest. The host layer performs the actual
 * effect (text box, inventory, flags store, audio); until that wiring
 * lands the intents are logged for visibility — same maturity as the
 * teleport / item hosts.
 *
 * Stateless (world captured in the subscription closure), and mode-gated
 * upstream: `TriggerSystem` only emits `TRIGGER_FIRED` in runtime mode,
 * so this never runs while editing. `wait` is a no-op placeholder until a
 * real sequencer lands (actions currently fire synchronously in order).
 */
export class EventActionSystem extends System {
  public readonly systemType = SystemType.Update

  private readonly logger = Logger.getInstance()

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    void scene

    this.events.on(EngineEvent.TRIGGER_FIRED, ({ entityId }) => {
      const entity = world.entityManager.getById(entityId)
      const comp = entity?.get(EventActionsComponent)
      if (!comp) return
      for (const action of comp.actions) this._run(action)
    })
  }

  private _run(action: ActionData): void {
    switch (action.type) {
      case 'show-text':
        this.events.emit(EngineEvent.SHOW_TEXT_REQUESTED, { text: action.text, speaker: action.speaker })
        break
      case 'teleport':
        this.events.emit(EngineEvent.TELEPORT_REQUESTED, {
          targetMapId: action.targetMapId,
          targetTileX: action.targetTileX,
          targetTileY: action.targetTileY,
          facing: action.facing as never,
        })
        break
      case 'give-item':
        this.events.emit(EngineEvent.ITEM_PICKED_UP, { itemId: action.itemId, qty: action.qty ?? 1 })
        break
      case 'set-flag':
        this.events.emit(EngineEvent.FLAG_SET, { flag: action.flag, value: action.value })
        break
      case 'play-sfx':
        this.events.emit(EngineEvent.PLAY_SFX_REQUESTED, { sound: action.sound })
        break
      case 'wait':
        // No sequencer yet — log so a mixed list's timing is visible.
        this.logger.debug(`[EventActionSystem] wait ${action.ms}ms (not yet sequenced)`)
        break
    }
  }

  public update(_elapsed: number): void {
    // Reactive — work happens in the event subscription installed in initialize().
  }
}
