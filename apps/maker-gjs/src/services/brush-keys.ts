// What the recent-brush strip remembers, as one string per entry.
//
// The strip holds tiles AND terrain brushes, and the two share no id
// space: sheet-local tile indices are numbers, terrain ids are strings,
// and tile 3 is not terrain "3". One prefixed key keeps them apart in a
// single LRU, and the widget hands the same string back when a swatch is
// tapped, so nothing has to be parsed twice.

/** Prefix of a tile entry; the rest is the sheet-local index. */
export const TILE_KEY_PREFIX = 'tile:'
/** Prefix of a terrain entry; the rest is the terrain id, verbatim. */
export const TERRAIN_KEY_PREFIX = 'terrain:'

export function tileBrushKey(tileId: number): string {
  return `${TILE_KEY_PREFIX}${tileId}`
}

export function terrainBrushKey(terrainId: string): string {
  return `${TERRAIN_KEY_PREFIX}${terrainId}`
}

/**
 * The terrain id in `key`, or `null` for a tile key.
 *
 * A terrain id may contain anything a JSON string may, including a
 * colon, so the id is everything after the FIRST prefix — never a split
 * on `:`.
 */
export function terrainIdOfBrushKey(key: string): string | null {
  return key.startsWith(TERRAIN_KEY_PREFIX) ? key.slice(TERRAIN_KEY_PREFIX.length) : null
}

/**
 * The sheet-local tile index in `key`, or `null` when it is not a tile
 * key (or carries no number, which a hand-made key could).
 */
export function tileIdOfBrushKey(key: string): number | null {
  if (!key.startsWith(TILE_KEY_PREFIX)) return null
  const id = Number(key.slice(TILE_KEY_PREFIX.length))
  return Number.isInteger(id) ? id : null
}
