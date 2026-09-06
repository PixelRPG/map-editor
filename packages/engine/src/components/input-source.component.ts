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
 * pre-scaled by the writer, see `readMovementInput`). `actionHeld` and
 * `attackHeld` are raw held states — consumers do their own edge
 * detection (e.g. `PlayerSystem` via `PlayerSessionComponent.actionWasHeld`,
 * `MeleeAttackSystem` via `CombatSessionComponent.attackWasHeld`).
 *
 * The two buttons are separate because they mean opposite things to the
 * same tile: action *talks to* the thing in front of you, attack *hits*
 * it. Overloading one button would make "open the chest" and "smash the
 * chest" indistinguishable at the point where the intent arrives.
 */
export class InputSourceComponent extends Component {
  constructor(
    public moveX = 0,
    public moveY = 0,
    public actionHeld = false,
    public attackHeld = false,
  ) {
    super()
  }
}
