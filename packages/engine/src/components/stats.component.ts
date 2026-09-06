import { Component } from 'excalibur'

/**
 * The **authored** stat block — pure serialisable data, built from the
 * `stats` component spec at spawn and never mutated at runtime.
 *
 * Live values live next door in {@link StatsRuntimeComponent}, the same
 * split as {@link TriggerComponent} / {@link TriggerFiredComponent}: a
 * playthrough that drops the hero to 1 hp must not rewrite the entity's
 * definition, and re-entering Play must be able to restore the authored
 * numbers without re-reading the project file.
 *
 * `hp` is the STARTING hit points (defaulting to `maxHp` when the author
 * left it alone), not the current ones — ask the runtime component for
 * those.
 */
export class StatsComponent extends Component {
  constructor(
    public readonly maxHp: number,
    public readonly hp: number,
    public readonly attack: number,
    public readonly defense: number,
    public readonly level: number,
    public readonly exp: number,
    public readonly expToNext: number,
  ) {
    super()
  }
}
