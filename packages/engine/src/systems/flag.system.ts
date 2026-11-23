import { type EventEmitter, type Scene, System, SystemType, type World } from 'excalibur'
import { GameSaveStateComponent, initialFlagValues } from '../components/game-save-state.component.ts'
import type { FlagData } from '../types/data/FlagData.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { SubscriptionScope } from '../utils/subscription-scope.ts'

/**
 * Folds `set-flag` actions into the playthrough's flag store.
 *
 * `FLAG_SET` has been emitted by `EventActionSystem` since the action
 * list shipped and heard by nothing — the write side of a store that did
 * not exist. This is that store's writer: it ensures the
 * {@link GameSaveStateComponent} is on the session singleton and records
 * every flag into it. {@link StateSystem} is the reader.
 *
 * Stateless (the scene is captured in the subscription closure) and
 * mode-gated upstream: `TriggerSystem` only emits `TRIGGER_FIRED` in
 * runtime mode, so nothing reaches this while editing.
 */
export class FlagSystem extends System {
  public readonly systemType = SystemType.Update

  private readonly subscriptions = new SubscriptionScope()

  constructor(
    private readonly events: EventEmitter<EngineEventMap>,
    private readonly flagDefs: readonly FlagData[] = [],
  ) {
    super()
  }

  public onInitialize(world: World, scene: Scene): void {
    if (super.onInitialize) super.onInitialize(world, scene)

    // Create the store up front so every reader finds a bag rather than
    // having to distinguish "no flags yet" from "no store at all".
    if (!SessionState.get(scene, GameSaveStateComponent)) {
      SessionState.set(scene, new GameSaveStateComponent(initialFlagValues(this.flagDefs)))
    }

    this.subscriptions.add(
      this.events.on(EngineEvent.FLAG_SET, ({ flag, value }) => {
        const store = SessionState.get(scene, GameSaveStateComponent)
        if (!store || store.flags[flag] === value) return
        store.flags[flag] = value
        // Workspace rule: a write to a session-singleton component is
        // followed by an explicit notify — Excalibur observes no fields.
        SessionState.notifyMutation(scene, store)
      }),
    )

    this.subscriptions.add(
      this.events.on(EngineEvent.COUNTER_CHANGED, ({ flag, amount }) => {
        const store = SessionState.get(scene, GameSaveStateComponent)
        if (!store) return
        const current = store.flags[flag]
        const next = (typeof current === 'number' ? current : 0) + amount
        // Re-announce the total as a plain flag write: the store, the toast
        // and the playtest read-back all already follow FLAG_SET.
        this.events.emit(EngineEvent.FLAG_SET, { flag, value: next })
      }),
    )
  }

  public dispose(): void {
    this.subscriptions.closeAll()
  }

  public onUpdate(_elapsed: number): void {
    // Reactive — work happens in the event subscription installed in initialize().
  }
}
