import { Component } from 'excalibur'

/**
 * A placement the user has armed for a one-shot move: the NEXT
 * select-tool tap on the canvas relocates this object instead of
 * changing the selection.
 *
 * Lives on the session-singleton entity (see
 * `docs/concepts/editor-architecture.md`) next to the other editor
 * session state, and carries a stable `ObjectPlacement.id` — never an
 * Excalibur runtime entity id, per `AGENTS.md` § Transport-ready
 * primitives.
 *
 * Why this is session state and not host-side UI state: the arming has
 * to change what a tap MEANS, and `TileEditorSystem` is the only place
 * that decides that. A flag the host kept to itself would still let the
 * tap fall through to `applySelect`, so the move's own target tap would
 * re-select whatever it landed on.
 *
 * Disarmed is modelled by `SessionState.unset`-ing the component, so
 * there is no "armed for nobody" state to get wrong. It is deliberately
 * NOT on the op-log: arming is a local intention, and only the
 * resulting move is a `Command` peers and undo see.
 */
export class PendingPlacementMoveComponent extends Component {
  constructor(public placementId: string) {
    super()
  }
}
