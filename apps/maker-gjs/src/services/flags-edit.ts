import {
  type FlagData,
  type FlagKind,
  type FlagUsage,
  defaultFlagInitial,
  findFlagUsages,
  newFlagId,
} from '@pixelrpg/engine'

/**
 * Editing the project's flags — pure, so the picker and the store stay
 * thin and the rules can be specced headlessly.
 */

/** What a successful flag edit hands back: the entry it replaced, i.e. the undo step. */
export interface FlagEditResult {
  /** The flag as stored now. */
  flag: FlagData
  /** The flag before, or `null` when it was created (undo = remove it). */
  previous: FlagData | null
}

/** Why a removal was refused, or what to put back to undo it. */
export type FlagRemoveResult =
  | { removed: true; previous: FlagData }
  | { removed: false; reason: 'unknown' }
  | { removed: false; reason: 'in-use'; usage: FlagUsage[] }

/** A flag called `name` with the kind's default start value and a free id. */
export function newFlag(list: readonly FlagData[], name: string, kind: FlagKind = 'yes-no'): FlagData {
  return { id: newFlagId(list, name), name: name.trim(), kind, initial: defaultFlagInitial(kind), scope: 'game' }
}

/** Where `flagId` is referenced, across the library and every loaded map. */
export function flagUsage(
  data: Parameters<typeof findFlagUsages>[0],
  maps: Parameters<typeof findFlagUsages>[1],
  flagId: string,
): FlagUsage[] {
  return findFlagUsages(data, maps).get(flagId) ?? []
}
