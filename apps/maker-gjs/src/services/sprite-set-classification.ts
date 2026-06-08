import type { CharacterDefinition, SpriteSetKind } from '@pixelrpg/engine'

/**
 * Sprite-set classification — the single source of truth for "is this a
 * character animation sheet or a world tileset". Used by the Cast picker,
 * the Tiles gallery, and the Data view so the rule stays consistent.
 */

/** Ids of every sprite-set referenced by a character (i.e. used as its sheet). */
export function characterSpriteSetIds(characters: readonly CharacterDefinition[] | undefined): Set<string> {
  return new Set((characters ?? []).map((c) => c.spriteSetId))
}

/**
 * Whether a sprite-set is a CHARACTER animation sheet (vs a world
 * tileset): explicitly tagged `kind: 'character'`, OR referenced by a
 * character (the belt-and-suspenders fallback that covers legacy /
 * untagged sheets). Tiles shows the complement; Cast shows these.
 */
export function isCharacterSpriteSet(kind: SpriteSetKind | undefined, referencedByCharacter: boolean): boolean {
  return kind === 'character' || referencedByCharacter
}
