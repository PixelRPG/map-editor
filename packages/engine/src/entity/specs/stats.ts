import type { ComponentSpec } from '../component-spec.ts'

/**
 * Stats — the numbers a fighting/levelling entity carries: hit points
 * first, then the offence/defence/progression set.
 *
 * **Data-only in this milestone.** `build` returns `null`, the same
 * shape as `movement` (whose `tilesPerSec` `PlayerSystem` reads off the
 * definition rather than off a runtime component). The live half — an hp
 * component that damage decrements, `DAMAGE_DEALT` / `ENTITY_DEFEATED` /
 * `LEVEL_UP` and the `StatsSystem` that folds them — ships with
 * `combat-action`, the one system that deals damage. Shipping the runtime
 * component now would attach it to every spawned actor for no reader,
 * which is exactly the gap `scripts/check-orphan-components.mjs` exists
 * to catch. See `docs/concepts/game-systems.md` and TODO.md.
 */
export const statsSpec: ComponentSpec = {
  type: 'stats',
  system: 'stats',
  editor: { label: 'Stats', icon: 'emblem-favorite-symbolic' },
  fields: [
    { key: 'maxHp', label: 'Max HP', input: 'int', basic: true, default: 10, min: 1 },
    { key: 'hp', label: 'HP', input: 'int', basic: true, default: 10, min: 0 },
    { key: 'attack', label: 'Attack', input: 'int', default: 1, min: 0 },
    { key: 'defense', label: 'Defense', input: 'int', default: 0, min: 0 },
    { key: 'speed', label: 'Speed', input: 'int', default: 1, min: 0 },
    { key: 'level', label: 'Level', input: 'int', default: 1, min: 1 },
    { key: 'exp', label: 'Experience', input: 'int', default: 0, min: 0 },
    { key: 'expToNext', label: 'Experience to next level', input: 'int', default: 10, min: 1 },
  ],
  build: () => null,
}
