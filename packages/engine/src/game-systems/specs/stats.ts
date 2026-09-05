import { statsSpec } from '../../entity/specs/stats.ts'
import type { GameSystemSpec } from '../game-system-spec.ts'

/**
 * `stats` — hit points and the numbers that go with them.
 *
 * Base (no switch), because both combat systems and the economy want the
 * same numbers and duplicating them per system is how two incompatible
 * "HP" fields get shipped.
 *
 * **No runtime in this build.** Its component is data-only (see
 * `statsSpec`); the live half — an hp component, `DAMAGE_DEALT`,
 * `ENTITY_DEFEATED`, `LEVEL_UP` and the system that folds them — arrives
 * with `combat-action`, the one thing that deals damage. Shipping that
 * runtime now would mean an engine event nothing emits and a component
 * nothing reads, which is the shape the previous milestone deleted.
 */
export const statsGameSystem: GameSystemSpec = {
  id: 'stats',
  editor: {
    label: 'Stats',
    kidLabel: 'Hearts and strength',
    icon: 'emblem-favorite-symbolic',
    base: true,
  },
  components: [statsSpec],
  runtime: () => [],
}
