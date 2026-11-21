import { Component } from 'excalibur'
import type { ActionData } from '../types/data/ActionData.ts'

/** Why a run was started — the `by` of the `TRIGGER_FIRED` that began it. */
export type ActionRunCause = 'walk-onto' | 'walk-off' | 'action-button' | 'auto'

/** One list a run is walking: the steps and the index of the next one. */
export interface ActionFrame {
  actions: readonly ActionData[]
  cursor: number
}

/** Why the current step has not finished yet. */
export type ActionPending = { kind: 'timer'; remainingMs: number } | { kind: 'ack'; token: string }

/**
 * A list in flight, attached to the entity whose trigger fired. Runtime
 * only — never serialised, never on the wire (each peer derives it from
 * the same trigger). `EventActionSystem` is the only writer.
 *
 * `frames` is a stack so a step can enter a sub-list and come back;
 * exactly one step is live across the whole stack, hence `pending` lives
 * on the run. See `docs/concepts/action-sequencer.md`.
 */
export class ActionRunComponent extends Component {
  public pending: ActionPending | null = null

  constructor(
    public frames: ActionFrame[],
    public blocking: boolean,
    public by: ActionRunCause,
  ) {
    super()
  }
}
