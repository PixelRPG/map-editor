import { Component } from 'excalibur'
import type { FlagValue } from '../types/data/EntityDefinition.ts'
import type { FlagData } from '../types/data/FlagData.ts'

/**
 * The value of every declared flag at the start of a playthrough, by id.
 * `scope: 'thing'` is stored but behaves like `'game'` here until the
 * world/player/thing split of the "Remember" stage lands.
 */
export function initialFlagValues(flags: readonly FlagData[] | undefined): Record<string, FlagValue> {
  const out: Record<string, FlagValue> = {}
  for (const flag of flags ?? []) out[flag.id] = flag.initial
  return out
}

/**
 * The playthrough's save state, on the session singleton.
 *
 * Its first (and today only) occupant is the **flag store**: the
 * key/value bag `set-flag` actions write and `EntityState.when`
 * conditions read. That pairing is the point — `FLAG_SET`
 * (`types/engine-events.ts`) has been emitted since the action list
 * shipped and heard by nobody; {@link FlagSystem} folds it in here and
 * {@link StateSystem} reads it back out, which is what makes the
 * key-and-door loop buildable without code.
 *
 * Runtime state, deliberately not persisted: a playtest starts with an
 * empty bag. Save/load of a playthrough (and what ↺ Restart resets) is a
 * separate question — see TODO.md.
 *
 * Live hit points, the inventory bag and the clock join it here as their
 * owning game systems ship; see `docs/concepts/game-systems.md`.
 */
export class GameSaveStateComponent extends Component {
  /**
   * Keys are flag ids (`GameProjectData.flags`). A fresh playthrough
   * starts from {@link initialFlagValues}, not from an empty bag.
   */
  constructor(public flags: Record<string, FlagValue> = {}) {
    super()
  }
}
