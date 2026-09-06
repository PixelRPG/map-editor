import { Component } from 'excalibur'

/** How a hostile moves when it is not chasing the player. */
export type HostileBehaviour = 'stationary' | 'patrol' | 'chase'

/**
 * An actor that fights the player: how it moves, how close it has to be
 * before it notices, what touching it costs, and what it leaves behind.
 *
 * Deliberately carries no hit points, sprite, speed or route of its own —
 * those are `stats`, `visual`, `movement` and `npc-route`. A second hp
 * field here would be the failure this component exists to avoid.
 *
 * Read by {@link HostileAiSystem} (movement + contact damage) and
 * {@link DefeatSystem} (drop, reward, respawn).
 */
export class HostileComponent extends Component {
  constructor(
    public readonly behaviour: HostileBehaviour,
    public readonly aggroTiles: number,
    public readonly contactDamage: number,
    public readonly attackEveryMs: number,
    public readonly dropChance: number,
    public readonly respawn: boolean,
    public readonly expReward: number,
    public readonly dropItemId?: string,
  ) {
    super()
  }
}
