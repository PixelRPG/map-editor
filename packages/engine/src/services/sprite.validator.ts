/**
 * Validator for sprite-related parameters and data integrity
 */
export class SpriteValidator {
  /**
   * Validate MapResource input parameter
   */
  static isValidMapResource(mapResource: any): boolean {
    if (!mapResource) {
      console.warn('[SpriteValidator] No mapResource provided')
      return false
    }
    return true
  }

  /**
   * Validate tile ID input parameter
   */
  static isValidTileId(tileId: number): boolean {
    if (typeof tileId !== 'number' || tileId < 0) {
      console.warn(`[SpriteValidator] Invalid tileId: ${tileId}`)
      return false
    }
    return true
  }

  /**
   * Validate sprite set ID
   */
  static isValidSpriteSetId(spriteSetId: string): boolean {
    if (!spriteSetId || typeof spriteSetId !== 'string') {
      console.warn('[SpriteValidator] Invalid sprite set ID:', spriteSetId)
      return false
    }
    return true
  }

  /**
   * Validate tile coordinates
   */
  static isValidTileCoords(x: number, y: number): boolean {
    const isValidX = typeof x === 'number' && x >= 0
    const isValidY = typeof y === 'number' && y >= 0

    if (!isValidX || !isValidY) {
      console.warn(`[SpriteValidator] Invalid tile coordinates: (${x}, ${y})`)
      return false
    }
    return true
  }

  /**
   * Validate layer ID
   */
  static isValidLayerId(layerId: string): boolean {
    if (!layerId || typeof layerId !== 'string' || layerId.trim() === '') {
      console.warn('[SpriteValidator] Invalid layer ID:', layerId)
      return false
    }
    return true
  }
}
