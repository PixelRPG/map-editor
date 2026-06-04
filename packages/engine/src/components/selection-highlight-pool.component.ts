import type { Actor } from 'excalibur'
import { Component } from 'excalibur'

export interface HighlightPoolEntry {
  ring: Actor
  target: Actor
}

/**
 * Scene-attached pool of `SelectionHighlightSystem` overlay rings
 * keyed by placement id. Lives on the session-singleton via
 * `SessionState` so the cross-tick state stays out of the system
 * instance (per AGENTS.md "all persistent state lives in components
 * or scene-attached resources").
 *
 * Disposed automatically with the scene — overlay actors die with
 * the world they were added to.
 */
export class SelectionHighlightPoolComponent extends Component {
  public readonly pool = new Map<string, HighlightPoolEntry>()
}
