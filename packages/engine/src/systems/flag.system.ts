import { type EventEmitter, type Scene, System, SystemType, type World } from 'excalibur'
import { GameSaveStateComponent } from '../components/game-save-state.component.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'

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

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)

    // Create the store up front so every reader finds a bag rather than
    // having to distinguish "no flags yet" from "no store at all".
    if (!SessionState.get(scene, GameSaveStateComponent)) {
      SessionState.set(scene, new GameSaveStateComponent())
    }

    this.events.on(EngineEvent.FLAG_SET, ({ flag, value }) => {
      const store = SessionState.get(scene, GameSaveStateComponent)
      if (!store || store.flags[flag] === value) return
      store.flags[flag] = value
      // Workspace rule: a write to a session-singleton component is
      // followed by an explicit notify — Excalibur observes no fields.
      SessionState.notifyMutation(scene, store)
    })
  }

  public update(_elapsed: number): void {
    // Reactive — work happens in the event subscription installed in initialize().
  }
}
