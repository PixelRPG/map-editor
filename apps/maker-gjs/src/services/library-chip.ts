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

/** Whether an arbitrary string (a GAction parameter, say) names a chip. */
export function isLibraryChip(value: string): value is LibraryChip {
  return (LIBRARY_CHIPS as readonly string[]).includes(value)
}
