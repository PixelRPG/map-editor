import { StatsComponent } from '../../components/index.ts'
import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/**
 * Stats — hit points and the numbers that modify them.
 *
 * Held back from the base layer until something read it (see
 * `docs/concepts/game-systems.md`); it ships in the same commit as
 * `combat-action`, which is the reader. Every field below has one:
 * `maxHp` draws the heart row and caps healing, `hp` seeds the live
 * block, `attack` is added to a swing's damage, `defense` is subtracted
 * from incoming damage, and `level` / `exp` / `expToNext` are the fold
 * `StatsSystem` runs when a defeated hostile pays out.
 *
 * **`speed` is deliberately absent**, though the design lists it. Its
 * only reader is `combat-turn`'s speed-sorted `TurnOrderSystem`, which is
 * deferred — in realtime combat a character's movement rate is
 * `movement.tilesPerSec`, and a second speed field would be the
 * duplication this component's siblings are written to avoid. Shipping it
 * here would reproduce, one field down, exactly the "declared but nobody
 * reads it" shape that kept `stats` out of the previous milestone. It
 * arrives with its reader; see the reach table.
 */
export interface StatsData extends ComponentData {
  type: 'stats'
  maxHp: number
  hp?: number
  attack?: number
  defense?: number
  level?: number
  exp?: number
  expToNext?: number
}

/** Default experience needed for the first level-up. */
const DEFAULT_EXP_TO_NEXT = 10

/**
 * Map authored stat data onto its runtime component, filling the same
 * defaults the field descriptors advertise.
 *
 * Exported because `PlayerSystem` composes the hero from its definition
 * through the registry, but a caller holding only `StatsData` (a test, a
 * runtime-spawned actor) should not have to go through a registry lookup
 * to get the identical mapping.
 */
export function buildStatsComponent(data: StatsData): StatsComponent {
  const maxHp = Math.max(1, Math.floor(data.maxHp ?? 1))
  return new StatsComponent(
    maxHp,
    Math.max(0, Math.floor(data.hp ?? maxHp)),
    Math.max(0, Math.floor(data.attack ?? 0)),
    Math.max(0, Math.floor(data.defense ?? 0)),
    Math.max(1, Math.floor(data.level ?? 1)),
    Math.max(0, Math.floor(data.exp ?? 0)),
    Math.max(1, Math.floor(data.expToNext ?? DEFAULT_EXP_TO_NEXT)),
  )
}

export const statsSpec: ComponentSpec = {
  type: 'stats',
  system: 'stats',
  editor: { label: 'Stats', icon: 'emote-love-symbolic', markerColor: '#ff6688', basic: true },
  fields: [
    { key: 'maxHp', label: 'Max HP', input: 'int', required: true, basic: true, default: 3, min: 1, max: 99 },
    { key: 'hp', label: 'HP', input: 'int', basic: true, default: 3, min: 0, max: 99 },
    { key: 'attack', label: 'Attack', input: 'int', default: 1, min: 0 },
    { key: 'defense', label: 'Defense', input: 'int', default: 0, min: 0 },
    { key: 'level', label: 'Level', input: 'int', default: 1, min: 1 },
    { key: 'exp', label: 'Experience', input: 'int', default: 0, min: 0 },
    { key: 'expToNext', label: 'Experience to next level', input: 'int', default: DEFAULT_EXP_TO_NEXT, min: 1 },
  ],
  build: (data) => buildStatsComponent(data as StatsData),
}
