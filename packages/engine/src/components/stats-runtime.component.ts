import { Component } from 'excalibur'

/**
 * The **live** stat block for one actor: what damage, healing and
 * experience actually change during a playthrough.
 *
 * Seeded by {@link StatsSystem} from the authored {@link StatsComponent}
 * and re-seeded on every editor → runtime transition, so pressing Play
 * twice starts from full hit points instead of inheriting the last run's
 * wounds. Runtime state, deliberately not persisted — the same rule
 * {@link GameSaveStateComponent} states for the flag store.
 *
 * `maxHp` is mirrored here rather than read off the authored block
 * because a level-up raises it, and raising it on the authored component
 * would edit the project from inside a playtest.
 */
export class StatsRuntimeComponent extends Component {
  constructor(
    public hp: number,
    public maxHp: number,
    public level: number,
    public exp: number,
    public expToNext: number,
  ) {
    super()
  }
}
