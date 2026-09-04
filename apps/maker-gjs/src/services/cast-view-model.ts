import type { CharacterAnimation, CharacterDefinition } from '@pixelrpg/engine'

/**
 * Pure view-model logic behind the Cast view: roster filtering, character
 * lookups, and the animation-resolution fallback the frame editor opens on.
 * GTK- and gettext-free so it is unit-testable (the view itself subclasses
 * `Adw.Bin` and can't be imported headlessly).
 */

/** Role chips above the roster. */
export type RoleFilter = 'all' | 'heroes' | 'npcs'

/** Movement speed a character falls back to when it carries none. */
export const DEFAULT_SPEED_TILES_PER_SEC = 4

/** The roster rows the active role chip admits, in project order. */
export function filterCharactersByRole(
  characters: readonly CharacterDefinition[],
  filter: RoleFilter,
): CharacterDefinition[] {
  if (filter === 'heroes') return characters.filter((character) => character.kind === 'hero')
  if (filter === 'npcs') return characters.filter((character) => character.kind === 'npc')
  return [...characters]
}

export function findCharacterById(
  characters: readonly CharacterDefinition[],
  id: string | null,
): CharacterDefinition | null {
  if (!id) return null
  return characters.find((character) => character.id === id) ?? null
}

/** The first character wearing `sheetId` — an appearance's authoring entry. */
export function findCharacterBySheet(
  characters: readonly CharacterDefinition[],
  sheetId: string,
): CharacterDefinition | null {
  return characters.find((character) => character.spriteSetId === sheetId) ?? null
}

/** How many characters share an appearance — the inspector's usage hint. */
export function countSheetUsers(characters: readonly CharacterDefinition[], sheetId: string): number {
  return characters.filter((character) => character.spriteSetId === sheetId).length
}

/**
 * The animation the frame editor opens on, or `null` for a brand-new one.
 *
 * Animations live on the sprite SHEET; a character's own list is the
 * back-compat fallback for sheets that carry none, and the fallback keys off
 * the sheet's array being absent — a sheet with an empty animation list
 * deliberately shadows the character's legacy entries.
 */
export function findAnimationToEdit(
  animId: string | null,
  sheetAnimations: CharacterAnimation[] | undefined,
  characterAnimations: CharacterAnimation[] | undefined,
): CharacterAnimation | null {
  if (!animId) return null
  const animations = sheetAnimations ?? characterAnimations ?? []
  return animations.find((animation) => animation.id === animId) ?? null
}

/** A character's movement speed in tiles/second, defaulted. */
export function characterSpeed(character: CharacterDefinition): number {
  return character.speedTilesPerSec ?? DEFAULT_SPEED_TILES_PER_SEC
}

/** Display name of a character's appearance, falling back to the raw sheet id. */
export function appearanceLabel(
  character: CharacterDefinition,
  sheets: readonly { id: string; name: string }[],
): string {
  return sheets.find((sheet) => sheet.id === character.spriteSetId)?.name ?? character.spriteSetId
}
