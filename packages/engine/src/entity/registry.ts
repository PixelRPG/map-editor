import type { ComponentSpecRegistry } from './component-spec.ts'
import { collisionSpec } from './specs/collision.ts'
import { customDataSpec } from './specs/custom-data.ts'
import { dialogueSpec } from './specs/dialogue.ts'
import { itemSpec } from './specs/item.ts'
import { movementSpec } from './specs/movement.ts'
import { npcRouteSpec } from './specs/npc-route.ts'
import { scriptSpec } from './specs/script.ts'
import { spawnPointSpec } from './specs/spawn-point.ts'
import { teleportSpec } from './specs/teleport.ts'
import { triggerSpec } from './specs/trigger.ts'
import { visualSpec } from './specs/visual.ts'

/**
 * Built-in component registry — every component `type` an
 * `EntityDefinition` can carry, keyed by spec `type`. The spawn pipeline
 * walks a definition's `components[]` and looks each up here to build the
 * runtime component; validation rejects any `type` absent from this map.
 *
 * Open like `BUILT_IN_COMMANDS`: a consumer (the future code editor)
 * layers user specs on top by spreading —
 *
 * ```ts
 * const registry = { ...BUILT_IN_COMPONENT_SPECS, [mySpec.type]: mySpec }
 * ```
 *
 * Completeness (every shipped `specs/*.ts` registered, no stale entries)
 * is auto-enforced by `registry.spec.ts`.
 */
export const BUILT_IN_COMPONENT_SPECS: ComponentSpecRegistry = {
  [visualSpec.type]: visualSpec,
  [movementSpec.type]: movementSpec,
  [collisionSpec.type]: collisionSpec,
  [triggerSpec.type]: triggerSpec,
  [teleportSpec.type]: teleportSpec,
  [itemSpec.type]: itemSpec,
  [dialogueSpec.type]: dialogueSpec,
  [npcRouteSpec.type]: npcRouteSpec,
  [spawnPointSpec.type]: spawnPointSpec,
  [customDataSpec.type]: customDataSpec,
  [scriptSpec.type]: scriptSpec,
}
