import { Component } from 'excalibur'

/**
 * Live i-frames: while this is attached, the actor absorbs no damage.
 *
 * Granted by {@link KnockbackSystem} on a hit (from
 * {@link InvulnerableComponent}'s `afterHitMs`) and dropped by it again
 * once the session clock passes `untilMs`. The damage sources —
 * {@link MeleeAttackSystem} and {@link HostileAiSystem} — check for it
 * *before* emitting `DAMAGE_DEALT`, so an invulnerable target produces no
 * event at all rather than an event that gets thrown away.
 */
export class InvulnerableUntilComponent extends Component {
  constructor(public untilMs: number) {
    super()
  }
}
