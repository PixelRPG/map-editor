import { Component } from 'excalibur'

/**
 * How long this actor is untouchable after taking a hit — the authored
 * half of the grace period that stops a hostile standing on the hero
 * from draining the whole heart row in three frames.
 *
 * The live half is {@link InvulnerableUntilComponent}, added on the hit
 * and dropped when it expires. Same authored/live split as
 * {@link StatsComponent} / {@link StatsRuntimeComponent}.
 *
 * Read by {@link KnockbackSystem}, which grants the window as part of the
 * hit reaction.
 */
export class InvulnerableComponent extends Component {
  constructor(public readonly afterHitMs: number) {
    super()
  }
}
