import { Sprite, Canvas } from 'excalibur'
import { TileMap, Tile } from 'excalibur'
import {
  EDITOR_CONSTANTS,
  getFallbackColor,
  areTileDimensionsValid,
} from './constants.ts'
import { MapResource } from '@pixelrpg/data-excalibur'

/**
 * Utility class for sprite management and tile graphics operations
 */
export class SpriteUtils {
  /**
   * Validate MapResource input parameter
   */
  private static isValidMapResource(mapResource: any): boolean {
    if (!mapResource) {
      console.warn('[SpriteUtils] No mapResource provided')
      return false
    }
    return true
  }

  /**
   * Validate tile ID input parameter
   */
  private static isValidTileId(tileId: number): boolean {
    if (typeof tileId !== 'number' || tileId < 0) {
      console.warn(`[SpriteUtils] Invalid tileId: ${tileId}`)
      return false
    }
    return true
  }

  /**
   * Validate sprite set ID
   */
  private static isValidSpriteSetId(spriteSetId: string): boolean {
    if (!spriteSetId || typeof spriteSetId !== 'string') {
      console.warn('[SpriteUtils] Invalid sprite set ID:', spriteSetId)
      return false
    }
    return true
  }

  /**
   * Get sprite count from sprite set resource
   */
  private static getSpriteCount(spriteSetResource: any): number {
    if (!spriteSetResource?.sprites) return 0

    if (Array.isArray(spriteSetResource.sprites)) {
      // Excalibur format: sprites is an array
      return spriteSetResource.sprites.length
    } else if (typeof spriteSetResource.sprites === 'object') {
      // GJS format: sprites is a Record<number, Sprite>
      const spriteIds = Object.keys(spriteSetResource.sprites).map((id) =>
        parseInt(id),
      )
      return spriteIds.length > 0 ? Math.max(...spriteIds) + 1 : 0
    }

    return 0
  }

  /**
   * Check if sprite exists in sprite set resource
   */
  private static spriteExists(
    spriteSetResource: any,
    spriteId: number,
  ): boolean {
    if (!spriteSetResource?.sprites) return false

    if (Array.isArray(spriteSetResource.sprites)) {
      // Excalibur format
      return !!spriteSetResource.sprites[spriteId]
    } else if (typeof spriteSetResource.sprites === 'object') {
      // GJS format
      return !!spriteSetResource.sprites[spriteId]
    }

    return false
  }
  /**
   * Find sprite set ID and sprite ID for a given global tile ID
   * @param mapResource The MapResource to search
   * @param tileId The global tile ID to find
   * @returns Object with spriteSetId and spriteId, or null if not found
   */
  static findSpriteInfoForTileId(
    mapResource: MapResource,
    tileId: number,
  ): { spriteSetId: string; spriteId: number } | null {
    // Validate input parameters
    if (!this.isValidMapResource(mapResource)) return null
    if (!this.isValidTileId(tileId)) return null

    try {
      const spriteSetResources = mapResource.getAllSpriteSetResources()
      const mapData = mapResource.mapData

      if (!spriteSetResources || !mapData?.spriteSets) {
        console.warn('[SpriteUtils] Invalid map resource data')
        return null
      }

      // Iterate through sprite sets to find the one containing this tile ID
      for (const [spriteSetId, spriteSetResource] of spriteSetResources) {
        if (!this.isValidSpriteSetId(spriteSetId)) continue

        const spriteSetRef = mapData.spriteSets.find(
          (ref: any) => ref?.id === spriteSetId,
        )
        if (
          !spriteSetRef?.firstGid ||
          typeof spriteSetRef.firstGid !== 'number'
        ) {
          continue
        }

        const firstGid = spriteSetRef.firstGid
        const spriteCount = this.getSpriteCount(spriteSetResource)
        const lastGid = firstGid + spriteCount - 1

        // Check if the tile ID falls within this sprite set's range
        if (tileId >= firstGid && tileId <= lastGid) {
          const localSpriteId = tileId - firstGid

          if (this.spriteExists(spriteSetResource, localSpriteId)) {
            return {
              spriteSetId: spriteSetId,
              spriteId: localSpriteId,
            }
          }
        }
      }

      console.warn(
        `[SpriteUtils] Could not find sprite info for tileId ${tileId} in any sprite set`,
      )
      return null
    } catch (error) {
      console.warn('[SpriteUtils] Error finding sprite info:', error)
      return null
    }
  }

  /**
   * Rebuild tile graphics from all sprites in the MapResource
   * @param tileMap The TileMap containing the tile
   * @param mapResource The MapResource with sprite data
   * @param tile The tile to rebuild graphics for
   */
  static rebuildTileGraphics(
    tileMap: TileMap,
    mapResource: MapResource,
    tile: Tile,
  ): void {
    // Validate input parameters
    if (!tileMap || !mapResource || !tile) {
      console.warn(
        '[SpriteUtils] Invalid input parameters for rebuildTileGraphics',
      )
      return
    }

    try {
      // Clear existing graphics
      tile.clearGraphics()

      // Get all sprites for this tile (from all layers)
      const allSprites = mapResource.getSpritesForTileAndLayer(tile)

      if (!Array.isArray(allSprites)) {
        console.warn('[SpriteUtils] Invalid sprites data')
        return
      }

      // Sort by z-index for proper layering
      const sortedSprites = allSprites
        .filter(
          (sprite) =>
            sprite?.spriteSetId && typeof sprite.spriteId === 'number',
        )
        .sort((a, b) => (a?.zIndex || 0) - (b?.zIndex || 0))

      // Add graphics for each sprite
      for (const spriteInfo of sortedSprites) {
        const graphic = this.getSpriteFromResource(mapResource, spriteInfo)
        if (graphic) {
          try {
            tile.addGraphic(graphic)
          } catch (error) {
            console.warn('[SpriteUtils] Error adding graphic to tile:', error)
          }
        }
      }
    } catch (error) {
      console.error('[SpriteUtils] Error rebuilding tile graphics:', error)
    }
  }

  /**
   * Get sprite from resource with error handling
   */
  private static getSpriteFromResource(
    mapResource: MapResource,
    spriteInfo: { spriteSetId: string; spriteId: number },
  ): Sprite | null {
    try {
      const spriteSetResource = mapResource.getSpriteSetResource(
        spriteInfo.spriteSetId,
      )
      if (!spriteSetResource) {
        console.warn(
          `[SpriteUtils] Sprite set resource not found: ${spriteInfo.spriteSetId}`,
        )
        return null
      }

      if (this.spriteExists(spriteSetResource, spriteInfo.spriteId)) {
        return spriteSetResource.sprites[spriteInfo.spriteId].clone()
      }

      console.warn(
        `[SpriteUtils] Sprite ${spriteInfo.spriteId} not found in sprite set ${spriteInfo.spriteSetId}`,
      )
      return null
    } catch (error) {
      console.warn(
        `[SpriteUtils] Error getting sprite ${spriteInfo.spriteId}:`,
        error,
      )
      return null
    }
  }
}
