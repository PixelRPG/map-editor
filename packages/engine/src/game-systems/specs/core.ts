import { actionsSpec } from '../../entity/specs/actions.ts'
import { collisionSpec } from '../../entity/specs/collision.ts'
import { customDataSpec } from '../../entity/specs/custom-data.ts'
import { dialogueSpec } from '../../entity/specs/dialogue.ts'
import { movementSpec } from '../../entity/specs/movement.ts'
import { npcRouteSpec } from '../../entity/specs/npc-route.ts'
import { scriptSpec } from '../../entity/specs/script.ts'
import { spawnPointSpec } from '../../entity/specs/spawn-point.ts'
import { teleportSpec } from '../../entity/specs/teleport.ts'
import { triggerSpec } from '../../entity/specs/trigger.ts'
import { visualSpec } from '../../entity/specs/visual.ts'
import { EventActionSystem } from '../../systems/event-action.system.ts'
import { FlagSystem } from '../../systems/flag.system.ts'
import { InputSystem } from '../../systems/input.system.ts'
import { PlayerSystem } from '../../systems/player.system.ts'
import { StateSystem } from '../../systems/state.system.ts'
import { TeleportSystem } from '../../systems/teleport.system.ts'
import { TriggerSystem } from '../../systems/trigger.system.ts'
import { WalkOnTileSystem } from '../../systems/walk-on-tile.system.ts'
import type { GameSystemSpec } from '../game-system-spec.ts'

/**
 * `core` — what every game has: something that looks like something,
 * moves, blocks, triggers, talks, teleports and runs an action list, plus
 * the flag store those actions write into.
 *
 * Base (no switch): a project without it is not a game. It is a game
 * system all the same, because every component needs an owner — that is
 * what lets `BUILT_IN_COMPONENT_SPECS` be derived instead of hand-listed.
 *
 * `runtime` contributes the GAMEPLAY systems only. The editor's own
 * systems (pointer gestures, camera, the tile editor, selection
 * highlighting, placement spawning) stay in `MapScene`: they are the
 * editor's infrastructure, present whatever the project switched on, and
 * nothing about them is a rule of the game.
 */
export const coreGameSystem: GameSystemSpec = {
  id: 'core',
  editor: {
    label: 'Core',
    kidLabel: 'The basics every game has',
    icon: 'applications-system-symbolic',
    base: true,
  },
  components: [
    visualSpec,
    movementSpec,
    collisionSpec,
    triggerSpec,
    teleportSpec,
    dialogueSpec,
    npcRouteSpec,
    spawnPointSpec,
    customDataSpec,
    scriptSpec,
    actionsSpec,
  ],
  runtime: (ctx) => [
    // InputSystem BEFORE PlayerSystem (insertion order = tick order at
    // equal priority): the player consumes the intent the same frame.
    new InputSystem(),
    new PlayerSystem(ctx.mapResource, ctx.events, ctx.playerCharacter, ctx.playerSpriteSet),
    new TriggerSystem(ctx.events),
    new TeleportSystem(ctx.events),
    new EventActionSystem(ctx.events),
    // FlagSystem writes the store `set-flag` actions target; StateSystem
    // reads it back each tick. They share the session component rather
    // than an event, so no ordering agreement is needed between them.
    new FlagSystem(ctx.events),
    new StateSystem(),
    new WalkOnTileSystem(ctx.mapResource, ctx.events),
  ],
}
