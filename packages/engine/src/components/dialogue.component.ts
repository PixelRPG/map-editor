import { Component } from 'excalibur'
import type { LocalizedText } from '../types/data/LocalizedText.ts'

/**
 * What an entity says when the player reads it (paired with a
 * `TriggerComponent` of mode `action-button`): an optional speaker and
 * the lines, each shown as its own text box in order.
 *
 * Pure data. The run is `TriggerSystem` (facing probe) → `TRIGGER_FIRED`
 * → `EventActionSystem`, which turns the lines into `show-text` steps, so
 * a dialogue blocks, locks and drops re-triggers exactly like one.
 */
export class DialogueComponent extends Component {
  constructor(
    public lines: readonly LocalizedText[] = [],
    public speaker?: LocalizedText,
  ) {
    super()
  }
}
