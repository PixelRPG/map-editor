import { type Entity, type Query, type Scene, System, SystemType, type World } from 'excalibur'
import { EntityStatesComponent } from '../components/entity-states.component.ts'
import { EventActionsComponent } from '../components/event-actions.component.ts'
import { GameSaveStateComponent } from '../components/game-save-state.component.ts'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import type { ActionData } from '../types/data/ActionData.ts'
import { type FlagValue, stateConditionHolds } from '../types/data/EntityDefinition.ts'
import { SessionState } from '../utils/session-state.ts'

type StatesQuery = Query<typeof EntityStatesComponent>

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

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    this.scene = scene
    this.statesQuery = world.queryManager.createQuery([EntityStatesComponent])
  }

  public update(_elapsed: number): void {
    const scene = this.scene
    if (!scene || !this.statesQuery) return
    if (!SessionState.get(scene, RuntimeModeComponent)) return

    const flags = SessionState.get(scene, GameSaveStateComponent)?.flags ?? {}
    for (const entity of this.statesQuery.entities) this.resolve(entity, flags)
  }

  /** Apply the first matching state (or the base) to one entity. */
  private resolve(entity: Entity, flags: Readonly<Record<string, FlagValue>>): void {
    const states = entity.get(EntityStatesComponent)
    if (!states) return

    const match = states.states.find((state) => stateConditionHolds(state.when, flags)) ?? null
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
