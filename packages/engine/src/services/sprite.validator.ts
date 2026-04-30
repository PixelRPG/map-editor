/**
 * Range guards for sprite-related numeric inputs.
 *
 * Type-level guarantees (e.g. `layerId: string`, `mapResource: MapResource`)
 * are trusted; only inputs whose validity isn't enforced by the type system
 * (numeric ranges, possibly-empty strings at API entry points) are checked
 * here. Callers should treat a `false` return as a contract violation, not a
 * runtime fallback.
 */

export function isValidTileId(tileId: number): boolean {
  if (typeof tileId !== 'number' || tileId < 0) {
    console.warn(`[SpriteValidator] Invalid tileId: ${tileId}`)
    return false
  }
  return true
}

export function isValidTileCoords(x: number, y: number): boolean {
  const isValidX = typeof x === 'number' && x >= 0
  const isValidY = typeof y === 'number' && y >= 0

  if (!isValidX || !isValidY) {
    console.warn(`[SpriteValidator] Invalid tile coordinates: (${x}, ${y})`)
    return false
  }
  return true
}
