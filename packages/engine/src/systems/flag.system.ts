import { type EventEmitter, type Scene, System, SystemType, type World } from 'excalibur'
import { type FlagValues, GameSaveStateComponent, initialSaveRecord } from '../components/game-save-state.component.ts'
import type { FlagData } from '../types/data/FlagData.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { SubscriptionScope } from '../utils/subscription-scope.ts'

/**
 * Folds `set-flag` actions into the playthrough's save record.
 *
 * `FLAG_SET` has been emitted by `EventActionSystem` since the action
 * list shipped and heard by nothing — the write side of a store that did
 * not exist. This is that store's writer: it ensures the
 * {@link GameSaveStateComponent} is on the session singleton and records
 * every flag into it. {@link StateSystem} is the reader.
 *
 * **Scope decides where a value lands.** A `scope: 'game'` flag is one
 * memory for the whole game (`world.flags`); a `scope: 'thing'` flag is
 * one memory per placement (`world.things[placementId]`), so two chests
 * sharing the flag "Chest is open" remember separately. The owning
 * placement rides on the event as `thing`. Design:
 * `docs/concepts/save-record.md`.
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

    // Create the store up front so every reader finds a record rather
    // than having to distinguish "no flags yet" from "no store at all".
    if (!SessionState.get(scene, GameSaveStateComponent)) {
      SessionState.set(scene, new GameSaveStateComponent(initialSaveRecord(this.flagDefs)))
    }

    this.subscriptions.add(
      this.events.on(EngineEvent.FLAG_SET, ({ flag, value, thing }) => {
        const store = SessionState.get(scene, GameSaveStateComponent)
        if (!store) return
        const bag = this.bagFor(store, flag, thing)
        if (bag[flag] === value) return
        bag[flag] = value
        // Workspace rule: a write to a session-singleton component is
        // followed by an explicit notify — Excalibur observes no fields.
        SessionState.notifyMutation(scene, store)
      }),
    )

    this.subscriptions.add(
      this.events.on(EngineEvent.COUNTER_CHANGED, ({ flag, amount, thing }) => {
        const store = SessionState.get(scene, GameSaveStateComponent)
        if (!store) return
        const bag = this.bagFor(store, flag, thing)
        const current = bag[flag] ?? this.initialOf(flag)
        const next = (typeof current === 'number' ? current : 0) + amount
        // Re-announce the total as a plain flag write: the store, the toast
        // and the playtest read-back all already follow FLAG_SET. The
        // owner rides along so the total lands in the same bag the
        // counter was read from.
        this.events.emit(EngineEvent.FLAG_SET, { flag, value: next, thing })
      }),
    )
  }

  /**
   * Where a write to `flag` belongs: the world's shared bag, or the
   * owning placement's own.
   *
   * A thing-scoped flag written by a run that is not on a placement
   * (a scripted or spec-supplied step) falls back to the world — a write
   * with no owner is better shared than dropped, and it is exactly what
   * the build did for every thing-scoped flag before the split.
   */
  private bagFor(store: GameSaveStateComponent, flag: string, thing: string | undefined): FlagValues {
    if (thing === undefined || this.scopeOf(flag) !== 'thing') return store.world.flags
    const own = store.world.things[thing]
    if (own) return own
    const fresh: FlagValues = {}
    store.world.things[thing] = fresh
    return fresh
  }

  /** The declared scope of `flag`; an undeclared flag is game-scoped. */
  private scopeOf(flag: string): FlagData['scope'] {
    return this.flagDefs.find((f) => f.id === flag)?.scope ?? 'game'
  }

  /** What a placement that has never written this flag counts from. */
  private initialOf(flag: string): number | undefined {
    const initial = this.flagDefs.find((f) => f.id === flag)?.initial
    return typeof initial === 'number' ? initial : undefined
  }

  public dispose(): void {
    this.subscriptions.closeAll()
  }

  public onUpdate(_elapsed: number): void {
    // Reactive — work happens in the event subscription installed in initialize().
  }
}
