import { Component } from 'excalibur'

/**
 * What an actor swings: reach, damage, cadence and how hard the hit
 * pushes. Carried by the hero and by any hostile that attacks with a
 * weapon rather than by walking into you.
 *
 * Read by {@link MeleeAttackSystem} (reach + damage + cadence) and
 * {@link KnockbackSystem} (`knockbackTiles`, resolved from the hit's
 * source). `animation` and `sound` are role/asset names the host plays;
 * the engine passes them through without interpreting them.
 */
export class WeaponComponent extends Component {
  constructor(
    public readonly damage: number,
    public readonly reachTiles: number,
    public readonly swingMs: number,
    public readonly knockbackTiles: number,
    public readonly animation?: string,
    public readonly sound?: string,
  ) {
    super()
  }
}
