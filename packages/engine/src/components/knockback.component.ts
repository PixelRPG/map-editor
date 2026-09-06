import { Component } from 'excalibur'

/**
 * An in-flight pushback: the velocity to hold, and until when.
 *
 * Attached by {@link KnockbackSystem} when a hit lands and removed by it
 * when the session clock passes `untilMs`. It exists as a component
 * rather than as a one-shot impulse because both `PlayerSystem` and
 * `HostileAiSystem` rewrite their actor's velocity every tick from input
 * or AI: an impulse applied once would be overwritten on the very next
 * frame. Knockback has to be re-asserted for as long as it lasts, and
 * where it lasts is the entity.
 */
export class KnockbackComponent extends Component {
  constructor(
    public readonly velX: number,
    public readonly velY: number,
    public readonly untilMs: number,
  ) {
    super()
  }
}
