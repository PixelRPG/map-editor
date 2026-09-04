/**
 * Resolve the project's player character view model.
 *
 * `MapScene` needs the flat {@link CharacterDefinition} that
 * `PlayerSystem` consumes, but the project persists the player as an
 * `EntityDefinition` in `entityLibrary` named by `playerActorId`. That
 * two-step lookup (find the entity, then map it) is the same on every
 * `loadMap`, and it must be tolerant at each step: a project can ship
 * without a `playerActorId`, with an id that no longer resolves, or
 * with an entity that carries no `visual.spriteSetId` — all three fall
 * back to the scene's procedural placeholder hero rather than failing
 * the map load.
 */

import { entityToCharacter } from '../entity/convert.ts'
import type { CharacterDefinition, GameProjectData } from '../types/data/index.ts'

/**
 * The player's view model for `project`, or `null` when the project
 * declares no usable player entity.
 */
export function resolvePlayerCharacter(project: GameProjectData | null | undefined): CharacterDefinition | null {
  const playerActorId = project?.playerActorId
  if (!playerActorId) return null
  const entity = project?.entityLibrary?.find((candidate) => candidate.id === playerActorId)
  if (!entity) return null
  return entityToCharacter(entity, playerActorId)
}
