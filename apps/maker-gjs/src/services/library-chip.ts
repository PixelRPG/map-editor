/**
 * The Library rail row's three chip pages, in header order. Cast,
 * Objects and Sheets were three rail rows of the same master-detail
 * shape over the same data (the entity library + the sprite sets); they
 * are one place with a chip filter now, and this is the filter's
 * vocabulary — shared by `LibraryView`, the `win.library-chip` action
 * and the deep links that land on a chip.
 *
 * `apps/mcp-bridge/src/tools/editing.tools.ts` carries a literal copy
 * (the bridge is deliberately dependency-free); change both together.
 */
export const LIBRARY_CHIPS = ['characters', 'things', 'graphics'] as const

/** One of the Library's chip pages. */
export type LibraryChip = (typeof LIBRARY_CHIPS)[number]

/** The chip a fresh Library opens on: the friendliest page. */
export const DEFAULT_LIBRARY_CHIP: LibraryChip = 'characters'

/**
 * The chips that exist in Full view only. Graphics is raw asset
 * management — tilesets and appearances as files to import, rename and
 * delete — which is exactly what Simple view keeps away from a child
 * (concept decision 2); the child dresses a character through the
 * appearance picker instead. Simple view shows Characters and Things.
 */
export const FULL_VIEW_ONLY_CHIPS: readonly LibraryChip[] = ['graphics']

/** Whether an arbitrary string (a GAction parameter, say) names a chip. */
export function isLibraryChip(value: string): value is LibraryChip {
  return (LIBRARY_CHIPS as readonly string[]).includes(value)
}

/** Whether `chip` is one the given view tier shows at all. */
export function isChipInTier(chip: LibraryChip, fullView: boolean): boolean {
  return fullView || !FULL_VIEW_ONLY_CHIPS.includes(chip)
}

/** The chips the header offers in the given tier, in header order. */
export function chipsForTier(fullView: boolean): LibraryChip[] {
  return LIBRARY_CHIPS.filter((chip) => isChipInTier(chip, fullView))
}

/**
 * Where the Library lands when its active chip leaves the tier — the
 * default chip, never an empty page. A chip that is still in the tier
 * stays where it is.
 */
export function chipForTier(chip: LibraryChip, fullView: boolean): LibraryChip {
  return isChipInTier(chip, fullView) ? chip : DEFAULT_LIBRARY_CHIP
}
