import { Component } from 'excalibur'
import type { ActionData } from '../types/data/ActionData.ts'
import type { EntityState } from '../types/data/EntityDefinition.ts'

/**
 * A spawned entity's own conditional states, attached by the spawn
 * pipeline when its definition declares any (`EntityDefinition.states`).
 *
 * Carries the authored states, the entity's BASE actions (what it does
 * with no state active — kept so switching back is a restore rather than
 * a guess) and the id of the state {@link StateSystem} last applied.
 * `activeStateId === null` means "base"; `resolvedOnce` distinguishes
 * that from "never evaluated", so the first resolve applies even when it
 * resolves to base.
 *
 * The data half lives in the definition and round-trips through JSON;
 * this is the runtime half — the same split as
 * `TriggerComponent` / `TriggerFiredComponent`.
 */
export class EntityStatesComponent extends Component {
  /** Id of the currently applied state, or `null` for the base composition. */
  public activeStateId: string | null = null
  /** False until {@link StateSystem} has evaluated this entity at least once. */
  public resolvedOnce = false

  constructor(
    public readonly states: readonly EntityState[],
    public readonly baseActions: readonly ActionData[],
  ) {
    super()
  }
}
