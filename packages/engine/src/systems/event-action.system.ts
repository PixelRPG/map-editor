import {
  type Entity,
  type EventEmitter,
  Logger,
  type Query,
  type Scene,
  System,
  SystemType,
  type World,
} from 'excalibur'
import { ActionRunComponent, type ActionRunCause } from '../components/action-run.component.ts'
import { ControlLockComponent } from '../components/control-lock.component.ts'
import { DialogueComponent } from '../components/dialogue.component.ts'
import { EventActionsComponent } from '../components/event-actions.component.ts'
import type { ActionData, AskOption } from '../types/data/ActionData.ts'
import { effectiveLanguages, type ProjectLanguages, resolveText } from '../types/data/LocalizedText.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { SubscriptionScope } from '../utils/subscription-scope.ts'

type RunQuery = Query<typeof ActionRunComponent>

/** What one step reports back to the sequencer. */
export type StepOutcome =
  | { kind: 'done' }
  | { kind: 'waiting' }
  | { kind: 'enter'; actions: readonly ActionData[] }
  | { kind: 'end' }

/** The `ack` token of a step that waits for the text box to close. */
export const DIALOGUE_ACK = 'dialogue'

/** The `ack` token of an `ask` step that waits for an answer. */
export const ASK_ACK = 'ask'

const DONE: StepOutcome = { kind: 'done' }
const WAITING: StepOutcome = { kind: 'waiting' }
const END: StepOutcome = { kind: 'end' }

/**
 * A dialogue is a list of `show-text` steps, one box per line, so it blocks
 * and locks like one. A line with nothing to say in the language being
 * played is left out: the editor keeps a freshly added blank line in the
 * data so it can be typed into, and an empty box would be a page the
 * player has to dismiss for nothing.
 */
function dialogueSteps(
  dialogue: DialogueComponent | undefined,
  languages: ProjectLanguages | undefined,
  locale: string | undefined,
): ActionData[] {
  if (!dialogue) return []
  const fallback = effectiveLanguages(languages).default
  const spoken = dialogue.lines
    .map((text, i) => ({ text, i }))
    .filter(({ text }) => resolveText(text, locale ?? fallback, fallback).trim() !== '')
  return spoken.map(({ text, i }) => ({
    id: `dialogue-${i}`,
    type: 'show-text',
    text,
    speaker: dialogue.speaker,
  }))
}

/**
 * Steps one run may execute per tick. Past it the run yields and resumes
 * next tick, so a list that enters itself stutters instead of hanging
 * the frame.
 */
export const MAX_STEPS_PER_TICK = 256

/**
 * Runs an event's ordered {@link ActionData} list — the runtime half of
 * the event-scripting system. Design: `docs/concepts/action-sequencer.md`.
 *
 * `TRIGGER_FIRED` only STARTS a run: it attaches an
 * {@link ActionRunComponent} to the firing entity and advances it at once,
 * so a list without a waiting step still finishes inside the trigger,
 * exactly as before. A run that has to wait (`wait`) stays on the entity
 * and `onUpdate` advances it per tick; with no run in flight the query is
 * empty and `onUpdate` returns on its first line.
 *
 * Re-triggers are dropped, not queued: an entity that already runs, or
 * any blocking run in the scene, refuses a new one. A blocking run takes
 * the player's controls through {@link ControlLockComponent} while it
 * waits; the world keeps ticking.
 *
 * Each step maps onto an engine-level intent event — `TELEPORT_REQUESTED`
 * / `ITEM_PICKED_UP` (existing host wiring keeps working) plus
 * `SHOW_TEXT_REQUESTED` / `FLAG_SET` / `PLAY_SFX_REQUESTED`. Mode-gated
 * upstream: `TriggerSystem` only fires in runtime mode.
 */
export class EventActionSystem extends System {
  public readonly systemType = SystemType.Update

  private readonly logger = Logger.getInstance()
  private readonly subscriptions = new SubscriptionScope()
  private runs: RunQuery | null = null
  private scene: Scene | null = null
  /** The options each waiting `ask` run offered; the answer carries only an id. */
  private readonly asked = new WeakMap<ActionRunComponent, readonly AskOption[]>()

  /**
   * `locale` is the language the running game shows its text in. It
   * defaults to the project default; a language picker (T6) passes the
   * player's choice here.
   */
  constructor(
    private readonly events: EventEmitter<EngineEventMap>,
    private readonly languages?: ProjectLanguages,
    private readonly locale?: string,
  ) {
    super()
  }

  public onInitialize(world: World, scene: Scene): void {
    if (super.onInitialize) super.onInitialize(world, scene)
    this.scene = scene
    this.runs = world.queryManager.createQuery([ActionRunComponent])

    this.subscriptions.add(
      this.events.on(EngineEvent.TRIGGER_FIRED, ({ entityId, by }) => {
        const entity = world.entityManager.getById(entityId)
        if (!entity) return
        const actions = [
          ...dialogueSteps(entity.get(DialogueComponent), this.languages, this.locale),
          ...(entity.get(EventActionsComponent)?.actions ?? []),
        ]
        if (actions.length === 0) return
        this.start(entity, actions, by)
      }),
    )

    this.subscriptions.add(
      this.events.on(EngineEvent.DIALOGUE_CLOSED, () => {
        for (const entity of this.runs?.entities ?? []) {
          const run = entity.get(ActionRunComponent)
          if (run?.pending?.kind === 'ack' && run.pending.token === DIALOGUE_ACK) run.pending = null
        }
      }),
    )

    this.subscriptions.add(
      this.events.on(EngineEvent.ASK_ANSWERED, ({ optionId }) => {
        for (const entity of this.runs?.entities ?? []) {
          const run = entity.get(ActionRunComponent)
          if (run?.pending?.kind !== 'ack' || run.pending.token !== ASK_ACK) continue
          const option = this.asked.get(run)?.find((o) => o.id === optionId)
          if (!option) continue
          this.asked.delete(run)
          run.pending = null
          // The chosen list runs next; when it is done the run carries on after the ask.
          if (option.actions.length > 0) run.frames.push({ actions: option.actions, cursor: 0 })
        }
      }),
    )
  }

  public dispose(): void {
    this.subscriptions.closeAll()
  }

  public onUpdate(elapsed: number): void {
    const runs = this.runs
    if (!runs || runs.entities.length === 0) return
    // A finishing run removes itself from the query mid-loop.
    for (const entity of runs.entities.slice()) {
      const run = entity.get(ActionRunComponent)
      if (run) this.advance(entity, run, elapsed)
    }
  }

  private start(entity: Entity, actions: readonly ActionData[], by: ActionRunCause): void {
    if (entity.has(ActionRunComponent) || this.blockingRunActive()) {
      this.logger.debug(`[EventActionSystem] dropped re-trigger (${by}) while a run is active`)
      return
    }
    const run = new ActionRunComponent([{ actions, cursor: 0 }], true, by)
    entity.addComponent(run)
    this.advance(entity, run, 0)
  }

  private blockingRunActive(): boolean {
    for (const entity of this.runs?.entities ?? []) {
      if (entity.get(ActionRunComponent)?.blocking) return true
    }
    return false
  }

  /** Walk the run until it waits, ends, or spends this tick's step budget. */
  private advance(entity: Entity, run: ActionRunComponent, elapsed: number): void {
    const pending = run.pending
    if (pending?.kind === 'timer') {
      pending.remainingMs -= elapsed
      if (pending.remainingMs > 0) return
      run.pending = null
    } else if (pending) {
      return
    }

    for (let steps = 0; steps < MAX_STEPS_PER_TICK; steps++) {
      const frame = run.frames[run.frames.length - 1]
      if (!frame) {
        this.finish(entity)
        return
      }
      if (frame.cursor >= frame.actions.length) {
        run.frames.pop()
        continue
      }
      const outcome = this.step(run, frame.actions[frame.cursor++])
      switch (outcome.kind) {
        case 'done':
          break
        case 'waiting':
          if (run.blocking) this.takeControls()
          return
        case 'enter':
          run.frames.push({ actions: outcome.actions, cursor: 0 })
          break
        case 'end':
          this.finish(entity)
          return
      }
    }
    this.logger.debug('[EventActionSystem] step budget spent, run resumes next tick')
  }

  private finish(entity: Entity): void {
    entity.removeComponent(ActionRunComponent, true)
    if (!this.blockingRunActive() && this.scene) SessionState.unset(this.scene, ControlLockComponent)
  }

  private takeControls(): void {
    if (this.scene && !SessionState.get(this.scene, ControlLockComponent)) {
      SessionState.set(this.scene, new ControlLockComponent())
    }
  }

  /** Run one step. Protected so a spec can supply steps no authored type produces yet. */
  protected step(run: ActionRunComponent, action: ActionData): StepOutcome {
    switch (action.type) {
      case 'show-text': {
        const fallback = effectiveLanguages(this.languages).default
        const locale = this.locale ?? fallback
        // Pending BEFORE the emit: a box with nothing to show closes inside
        // the emit, and that close must find the step already waiting.
        run.pending = { kind: 'ack', token: DIALOGUE_ACK }
        this.events.emit(EngineEvent.SHOW_TEXT_REQUESTED, {
          text: resolveText(action.text, locale, fallback),
          speaker: action.speaker === undefined ? undefined : resolveText(action.speaker, locale, fallback),
        })
        return run.pending ? WAITING : DONE
      }
      case 'ask': {
        const fallback = effectiveLanguages(this.languages).default
        const locale = this.locale ?? fallback
        this.asked.set(run, action.options)
        // Pending BEFORE the emit, as `show-text` does: an answer may come inside it.
        run.pending = { kind: 'ack', token: ASK_ACK }
        this.events.emit(EngineEvent.ASK_REQUESTED, {
          prompt: resolveText(action.prompt, locale, fallback),
          options: action.options.map((o) => ({ id: o.id, label: resolveText(o.label, locale, fallback) })),
          cancelId: action.cancelOptionId,
        })
        return run.pending ? WAITING : DONE
      }
      case 'teleport':
        this.events.emit(EngineEvent.TELEPORT_REQUESTED, {
          targetMapId: action.targetMapId,
          targetTileX: action.targetTileX,
          targetTileY: action.targetTileY,
          facing: action.facing as never,
        })
        // The scene that owns this run and the lock is about to be retired.
        return END
      case 'give-item':
        this.events.emit(EngineEvent.ITEM_PICKED_UP, { itemId: action.itemId, qty: action.qty ?? 1 })
        return DONE
      case 'set-flag':
        this.events.emit(EngineEvent.FLAG_SET, { flag: action.flag, value: action.value })
        return DONE
      case 'play-sfx':
        this.events.emit(EngineEvent.PLAY_SFX_REQUESTED, { sound: action.sound })
        return DONE
      case 'wait':
        if (action.ms <= 0) return DONE
        run.pending = { kind: 'timer', remainingMs: action.ms }
        return WAITING
    }
  }
}
