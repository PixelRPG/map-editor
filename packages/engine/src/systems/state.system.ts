import { type Entity, type Query, type Scene, System, SystemType, type World } from 'excalibur'
import { EntityStatesComponent } from '../components/entity-states.component.ts'
import { EventActionsComponent } from '../components/event-actions.component.ts'
import { GameSaveStateComponent, resolvedFlagView, type WorldRecord } from '../components/game-save-state.component.ts'
import { PlacementIdComponent } from '../components/placement-id.component.ts'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import type { ActionData } from '../types/data/ActionData.ts'
import { evaluateCondition } from '../types/data/Condition.ts'
import { SessionState } from '../utils/session-state.ts'

type StatesQuery = Query<typeof EntityStatesComponent>

/** What a scene with no save record yet resolves against: every flag at its `initial`. */
const EMPTY_WORLD: WorldRecord = { flags: {}, things: {}, removedThings: [] }

/**
 * Resolves each entity's active {@link EntityState} against the flag
 * store and applies its overlay — the runtime half of the no-code
 * behaviour tier (RPG-Maker event pages, modernised).
 *
 * First matching state wins, exactly as the type documents; no match
 * restores the base composition. A state without a `when` is never
 * auto-activated (it is a manually/scripted-switched state).
 *
 * **Actions only.** The overlay this build applies is the `actions`
 * component: the matched state's action list replaces the entity's, so
 * `EventActionSystem` runs the new body unchanged. A state carrying any
 * other component type validates with a warning and stays inert — the
 * visible cost is honest and worth naming: a door teleports once the key
 * flag is set but never *looks* open, and a chest still looks closed
 * after it gave you its item. Swapping a live entity's sprite and
 * collider mid-frame is the first piece of engine work in this design
 * that rebuilds a spawned entity, and it deserves its own round rather
 * than a ride on the flag store's. See TODO.md.
 *
 * Resolution is per-tick and idempotent rather than event-driven: it
 * therefore covers entities spawned after a flag was set, needs no
 * ordering agreement with {@link FlagSystem}, and cannot miss an event.
 * Gated on `RuntimeModeComponent` like `PlayerSystem` — the editor always
 * shows the base composition.
 */
export class StateSystem extends System {
  public readonly systemType = SystemType.Update

  private statesQuery: StatesQuery | null = null
  private scene: Scene | null = null

  public onInitialize(world: World, scene: Scene): void {
    if (super.onInitialize) super.onInitialize(world, scene)
    this.scene = scene
    this.statesQuery = world.queryManager.createQuery([EntityStatesComponent])
  }

  public onUpdate(_elapsed: number): void {
    const scene = this.scene
    if (!scene || !this.statesQuery) return
    if (!SessionState.get(scene, RuntimeModeComponent)) return

    const world = SessionState.get(scene, GameSaveStateComponent)?.world ?? EMPTY_WORLD
    for (const entity of this.statesQuery.entities) this.resolve(entity, world)
  }

  /** Apply the first matching state (or the base) to one entity. */
  private resolve(entity: Entity, world: WorldRecord): void {
    const states = entity.get(EntityStatesComponent)
    if (!states) return

    // The view this entity sees: the world's shared values with its own
    // placement's thing-scoped values layered on top. Built per entity
    // because `scope: 'thing'` means "one memory per placement" — two
    // chests reading one flag read two different values.
    const flags = resolvedFlagView(world, entity.get(PlacementIdComponent)?.id ?? null)
    const match = states.states.find((state) => evaluateCondition(state.when, { flags })) ?? null
    const nextId = match?.id ?? null
    if (states.resolvedOnce && states.activeStateId === nextId) return

    states.activeStateId = nextId
    states.resolvedOnce = true
    this.applyActions(entity, this.overlayActions(match?.components) ?? states.baseActions)
  }

  /**
   * The `actions` overlay a state carries, or `null` when it carries
   * none — a state that overlays other component types leaves the base
   * action list in place rather than clearing it.
   */
  private overlayActions(components: readonly { type: string }[] | undefined): ActionData[] | null {
    const data = components?.find((c) => c.type === 'actions') as { actions?: unknown } | undefined
    if (!data) return null
    return Array.isArray(data.actions) ? (data.actions as ActionData[]) : []
  }

  /** Swap the entity's live action list, adding the component if the base had none. */
  private applyActions(entity: Entity, actions: readonly ActionData[]): void {
    const existing = entity.get(EventActionsComponent)
    if (existing) {
      existing.actions = actions.slice()
      return
    }
    if (actions.length > 0) entity.addComponent(new EventActionsComponent(actions.slice()))
  }
}
