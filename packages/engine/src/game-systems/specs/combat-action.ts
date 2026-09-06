import { hostileSpec } from '../../entity/specs/hostile.ts'
import { hurtboxSpec } from '../../entity/specs/hurtbox.ts'
import { invulnerableSpec } from '../../entity/specs/invulnerable.ts'
import { weaponSpec } from '../../entity/specs/weapon.ts'
import { DefeatSystem } from '../../systems/defeat.system.ts'
import { HostileAiSystem } from '../../systems/hostile-ai.system.ts'
import { HudSystem } from '../../systems/hud.system.ts'
import { KnockbackSystem } from '../../systems/knockback.system.ts'
import { MeleeAttackSystem } from '../../systems/melee-attack.system.ts'
import type { GameSystemSpec } from '../game-system-spec.ts'

/**
 * `combat-action` — realtime fighting, the Zelda / Secret of Mana shape:
 * swing a sword at what is in front of you, get pushed back when
 * something hits you, and watch a heart row while it happens.
 *
 * **The first switchable game system**, and therefore the first proof the
 * frame carries weight beyond its base layer: everything below is a
 * registration, not a refactor. Turning it on adds four components to the
 * inspector, two templates to the New-object chooser and five ECS systems
 * to the scene; turning it off leaves every one of those components on
 * disk, inert and read-only.
 *
 * **What it reuses rather than duplicates** is the whole point of the
 * component model. Hit points are `stats`, the enemy's look is `visual`,
 * its speed is `movement`, its patrol is `npc-route`, its solidity is
 * `collision`, and its drop is `inventory`'s `item`. A second hp field
 * here would be the failure, so a hostile is an ordinary placement with
 * one more component on it — placed with the object brush, needing no map
 * data of its own.
 *
 * **System order is load-bearing.** `MeleeAttackSystem` runs first
 * because it advances the shared combat clock every later system reads;
 * `KnockbackSystem` runs after both movement writers so its pushback
 * survives the velocity they set each tick; `HudSystem` runs last so it
 * draws the hit points the same frame's damage produced.
 */
export const combatActionGameSystem: GameSystemSpec = {
  id: 'combat-action',
  editor: {
    label: 'Action combat',
    kidLabel: 'Fighting like Zelda',
    icon: 'edit-cut-symbolic',
  },
  // `stats` and `inventory` are base systems, so this is not what turns
  // them on — it says out loud what this system reads, keeps the "Also
  // turns on" row honest, and keeps the dependency true if either ever
  // stops being base.
  requires: ['stats', 'inventory'],
  components: [weaponSpec, hostileSpec, hurtboxSpec, invulnerableSpec],
  templates: [
    {
      id: 'enemy',
      label: 'Enemy',
      icon: 'face-angry-symbolic',
      description: 'A creature that chases the player and hurts on contact.',
      components: [
        { type: 'visual', spriteSetId: '', spriteId: 0 },
        { type: 'movement', tilesPerSec: 2 },
        { type: 'stats', maxHp: 3, hp: 3, attack: 0, defense: 0 },
        { type: 'hostile', behaviour: 'chase', aggroTiles: 4, contactDamage: 1 },
        { type: 'hurtbox' },
        { type: 'collision' },
      ],
    },
    {
      id: 'weapon',
      label: 'Weapon',
      icon: 'edit-cut-symbolic',
      description: 'A pickup that lets whoever carries it swing at enemies.',
      components: [
        { type: 'visual', spriteSetId: '', spriteId: 0 },
        { type: 'item', itemId: '', qty: 1 },
        { type: 'weapon', damage: 1, reachTiles: 1 },
        { type: 'trigger', on: 'walk-onto' },
      ],
    },
  ],
  runtime: (ctx) => [
    new MeleeAttackSystem(ctx.mapResource, ctx.events),
    new HostileAiSystem(ctx.mapResource, ctx.events),
    new KnockbackSystem(ctx.mapResource, ctx.events),
    new DefeatSystem(ctx.mapResource, ctx.events, ctx.entityLibrary, ctx.componentRegistry),
    new HudSystem(),
  ],
}
