import { Component } from 'excalibur'

/**
 * Dialogue reference for an entity — the lines shown when the player
 * interacts (paired with a `TriggerComponent` of mode `action-button`).
 *
 * Split out of the old `NpcComponent` (which bundled dialogue + route +
 * facing) so each component maps 1:1 to a registry spec. Pure data; a
 * future `DialogueSystem` reads it but never mutates it.
 */
export class DialogueComponent extends Component {
  constructor(public dialogueId: string) {
    super()
  }
}
