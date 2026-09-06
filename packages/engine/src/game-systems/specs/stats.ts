import { statsSpec } from '../../entity/specs/stats.ts'
import { StatsSystem } from '../../systems/stats.system.ts'
import type { GameSystemSpec } from '../game-system-spec.ts'

/**
 * `stats` — hit points, and the numbers that move them.
 *
 * Base (no switch), and it earned that the hard way: it was cut from the
 * framework milestone precisely because nothing read it, and an
 * always-on bundle whose eight editable fields change nothing about the
 * game is the "declared but nobody reads it" shape with a UI row in front
 * of it. It ships in the same commit as `combat-action`, its reader.
 *
 * Base rather than switchable because every combat system wants hit
 * points and none of them wants its own copy: `combat-action` reads this
 * one, `combat-turn` will read the same one, and the `economy` design
 * already records why `stamina` must NOT be folded in here (a farming
 * game with no fighting must not grow a health bar). One owner, several
 * readers — the reuse a `requires` line buys.
 *
 * `StatsSystem` deliberately owns only what hit points *are*: damage
 * applied, defeat announced, experience folded. What a defeat *means* —
 * a drop, a respawn, a game over — belongs to whichever combat system is
 * on, and reaches it as `ENTITY_DEFEATED`.
 */
export const statsGameSystem: GameSystemSpec = {
  id: 'stats',
  editor: {
    label: 'Stats',
    kidLabel: 'Hearts, strength and growing stronger',
    icon: 'emote-love-symbolic',
    base: true,
  },
  components: [statsSpec],
  runtime: (ctx) => [new StatsSystem(ctx.events)],
}
