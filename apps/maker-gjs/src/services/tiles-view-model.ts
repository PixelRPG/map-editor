import type { CharacterAnimation, CharacterDefinition } from '@pixelrpg/engine'

/**
 * Pure view-model logic behind the Sheets (Tiles) view: gallery search /
 * sort, drag-reorder index math, and the synthetic character an appearance
 * sheet is previewed through. GTK- and gettext-free so it is unit-testable
 * (the view itself subclasses `Adw.Bin` and can't be imported headlessly).
 */

/** Sort orders the gallery's sort dropdown offers, in dropdown row order. */
export const TILESET_SORTS = ['default', 'name', 'size', 'usage'] as const

export type TilesetSort = (typeof TILESET_SORTS)[number]

/** Sort order for a dropdown row index; anything out of range is the default order. */
export function tilesetSortAtIndex(index: number): TilesetSort {
  return TILESET_SORTS[index] ?? 'default'
}

/** Built-in sprite sets (engine-provided) have no project files to remove. */
export function isBuiltInSpriteSet(id: string): boolean {
  return id.startsWith('built-in:')
}

/** The fields the gallery's search + sort read off one tileset. */
export interface TilesetSortKey {
  name: string
  spriteWidth: number
  mapUsers: number
}

/** Search text + sort order the gallery is currently showing. */
export interface TilesetQuery {
  search: string
  sort: TilesetSort
}

/**
 * Apply the gallery's search filter and sort order. `default` keeps the
 * caller's order (the project's `spriteSets[]` order); every other order is
 * a stable sort of the filtered list, so equal keys stay in project order.
 */
export function filterSortTilesets<T>(
  entries: readonly T[],
  keyOf: (entry: T) => TilesetSortKey,
  query: TilesetQuery,
): T[] {
  const needle = query.search.trim().toLowerCase()
  const filtered = needle ? entries.filter((entry) => keyOf(entry).name.toLowerCase().includes(needle)) : [...entries]
  if (query.sort === 'name') filtered.sort((a, b) => keyOf(a).name.localeCompare(keyOf(b).name))
  else if (query.sort === 'size') filtered.sort((a, b) => keyOf(b).spriteWidth - keyOf(a).spriteWidth)
  else if (query.sort === 'usage') filtered.sort((a, b) => keyOf(b).mapUsers - keyOf(a).mapUsers)
  return filtered
}

/**
 * Order items by the project's `spriteSets[]` array, so a drag-reorder
 * (which rewrites that array) shows on the next re-hydration — the loaded
 * resource map keeps its original insertion order instead. Ids absent from
 * the array (built-ins) sort to the end in their existing order.
 */
export function orderByProjectSpriteSets<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  order: readonly string[],
): T[] {
  const rank = new Map(order.map((id, index) => [id, index]))
  return [...items].sort(
    (a, b) => (rank.get(idOf(a)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(idOf(b)) ?? Number.MAX_SAFE_INTEGER),
  )
}

/**
 * Move the item identified by `draggedId` to just before `targetId`.
 *
 * The dragged item always ends up immediately before the target, in both
 * drag directions — the target index is resolved after the removal, so the
 * removal never shifts it. Returns `null` for a no-op — a self-drop, or
 * either id missing — so the caller can skip both the rebuild and the
 * reorder broadcast.
 */
export function moveBefore<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  draggedId: string,
  targetId: string,
): T[] | null {
  if (draggedId === targetId) return null
  const from = items.findIndex((item) => idOf(item) === draggedId)
  if (from === -1 || !items.some((item) => idOf(item) === targetId)) return null
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(
    next.findIndex((item) => idOf(item) === targetId),
    0,
    moved,
  )
  return next
}

/**
 * A throwaway {@link CharacterDefinition} bound to an appearance sheet, so
 * the character-keyed preview widgets can render a SHEET directly in the
 * gallery cards + the quick-view glance. The sheet owns the animations.
 * Never persisted.
 */
export function sheetAsCharacter(
  sheetId: string | null,
  sheets: readonly { id: string; name: string }[],
  animationsOf: (sheetId: string) => CharacterAnimation[],
): CharacterDefinition | null {
  if (!sheetId) return null
  return {
    id: sheetId,
    name: sheets.find((sheet) => sheet.id === sheetId)?.name ?? sheetId,
    kind: 'hero',
    spriteSetId: sheetId,
    defaultAnimation: 'idle-down',
    animations: animationsOf(sheetId),
  }
}

/**
 * The tileset the Sheets view is on, paired with the state of the grid
 * actually on screen for it.
 *
 * ONE value, never two fields. The palette is loaded asynchronously
 * *after* the id moves, so a failed load used to leave the PREVIOUS
 * set's tiles under the NEW set's id — and the next tile click routed
 * that stale sprite id into the new set's id space (silent data
 * corruption, not a cosmetic glitch). Pairing them means the id and the
 * grid move together or not at all.
 */
export interface ActiveTileset {
  /** The selected tileset's id — what the gallery highlights. */
  id: string
  /**
   * `loaded`: the palette shows THIS set's grid.
   * `unavailable`: the sheet failed to load, so the palette was cleared —
   * there is no grid to click and no sprite id to attribute.
   */
  palette: 'loaded' | 'unavailable'
}

/**
 * The sprite-set id a tile-property edit may be attributed to: only a
 * set whose own grid is on screen. `null` for no selection or a failed
 * load — the caller must then write nothing.
 */
export function editableTilesetId(active: ActiveTileset | null): string | null {
  return active?.palette === 'loaded' ? active.id : null
}

/**
 * Resolve what the palette must show for `activeId`, loading the sheet
 * through `loadSheet` (which reports `null` when it cannot).
 *
 * The point of returning a value instead of calling widget setters in
 * sequence: "leave the previous grid up" is not one of the outcomes, so
 * the failure path cannot fall through to it. Every caller must apply
 * exactly one of the three.
 */
export async function resolvePaletteTarget<TSheet>(
  activeId: string | null,
  loadSheet: (id: string) => Promise<TSheet | null>,
): Promise<{ active: ActiveTileset | null; sheet: TSheet | null }> {
  if (!activeId) return { active: null, sheet: null }
  const sheet = await loadSheet(activeId)
  return sheet
    ? { active: { id: activeId, palette: 'loaded' }, sheet }
    : { active: { id: activeId, palette: 'unavailable' }, sheet: null }
}
