import { type EntityDefinition, getComponentData, isCharacterEntity, type SpriteSetKind } from '@pixelrpg/engine'

/**
 * Sprite-set classification — the single source of truth for "is this a
 * character animation sheet or a world tileset". Used by the Cast picker,
 * the Tiles gallery, and the Data view so the rule stays consistent.
 */

/**
 * Ids of every sprite-set used as a character appearance — the `visual`
 * component's `spriteSetId` of each `character`-template entity in the
 * project's `entityLibrary`.
 */
export function characterSpriteSetIds(entityLibrary: readonly EntityDefinition[] | undefined): Set<string> {
  const ids = new Set<string>()
  for (const def of entityLibrary ?? []) {
    if (!isCharacterEntity(def)) continue
    const spriteSetId = getComponentData(def, 'visual')?.spriteSetId
    if (typeof spriteSetId === 'string') ids.add(spriteSetId)
  }
  return ids
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
