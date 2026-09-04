import {
  type CharacterDefinition,
  type EntityDefinition,
  entityToCharacter,
  isCharacterEntity,
  type SpriteSetKind,
} from '@pixelrpg/engine'
import type { SpriteSetChoice } from '@pixelrpg/gjs'

import { characterSpriteSetIds, isCharacterSpriteSet } from './sprite-set-classification.ts'

/** The slice of the project data the cast list is derived from. */
export interface CastProjectData {
  entityLibrary?: EntityDefinition[]
  playerActorId?: string
}

/** The slice of a loaded sprite-set the picker needs (structural — engine or GTK resource). */
export interface SpriteSetEntry {
  data?: { kind?: SpriteSetKind; name?: string } | null
}

/**
 * The project's characters as flat view models — the `character`-template
 * entities in `entityLibrary`, with `isPlayer` resolved from
 * `playerActorId` (a single id, so the one-of-N invariant is structural).
 */
export function listCharacterViewModels(data: CastProjectData | null): CharacterDefinition[] {
  if (!data?.entityLibrary) return []
  const out: CharacterDefinition[] = []
  for (const def of data.entityLibrary) {
    if (!isCharacterEntity(def)) continue
    const char = entityToCharacter(def, data.playerActorId)
    if (char) out.push(char)
  }
  return out
}

/**
 * Every sprite set assignable to a character. World tilesets are excluded
 * (see `isCharacterSpriteSet`), and sets already used by a character sort
 * first — so the New Character dialog defaults to an actual character
 * sheet, whose first sprite previews well, rather than an environment
 * tileset whose sprite 0 is a transparent tile.
 */
export function listAssignableSpriteSets(
  spriteSets: ReadonlyMap<string, SpriteSetEntry>,
  entityLibrary: readonly EntityDefinition[] | undefined,
): SpriteSetChoice[] {
  const usedByCharacter = characterSpriteSetIds(entityLibrary)
  return [...spriteSets.entries()]
    .filter(([id, set]) => isCharacterSpriteSet(set.data?.kind, usedByCharacter.has(id)))
    .map(([id, set]) => ({ id, name: set.data?.name ?? id }))
    .sort((a, b) => Number(usedByCharacter.has(b.id)) - Number(usedByCharacter.has(a.id)))
}
