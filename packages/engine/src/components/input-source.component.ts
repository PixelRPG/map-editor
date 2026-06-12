import { Component } from 'excalibur'

/**
 * The player's CURRENT input intent — pure data on the session
 * singleton, decoupled from any physical device.
 *
 * Transport-ready rule 3 (AGENTS.md): gameplay systems read input
 * from this component, never from the keyboard directly. The local
 * {@link InputSystem} writes it from the host keyboard today; a
 * remote peer's network frames, a replay, a split-screen player slot
 * or an AI driver can write the same shape tomorrow — alternative
 * input sources become a plug-in surface instead of a refactor.
 *
 * `moveX`/`moveY` form a normalised direction vector (diagonals are
 * pre-scaled by the writer, see `readMovementInput`). `actionHeld` is
 * the raw held state — consumers do their own edge detection (e.g.
 * `PlayerSystem` via `PlayerSessionComponent.actionWasHeld`).
 */
export class InputSourceComponent extends Component {
  constructor(
    public moveX = 0,
    public moveY = 0,
    public actionHeld = false,
  ) {
    super()
  }
}
