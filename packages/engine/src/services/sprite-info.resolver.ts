import { MapResource } from '../resource/MapResource.ts'
import { SpriteValidator } from './sprite.validator'

/**
 * Resolver for finding sprite information from tile IDs and resources
 */
export class SpriteInfoResolver {
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
    if (!SpriteValidator.isValidMapResource(mapResource)) return null
    if (!SpriteValidator.isValidTileId(tileId)) return null

    try {
      const spriteSetResources = mapResource.getAllSpriteSetResources()
      const mapData = mapResource.mapData

      if (!spriteSetResources || !mapData?.spriteSets) {
        console.warn('[SpriteInfoResolver] Invalid map resource data')
        return null
      }

      // Iterate through sprite sets to find the one containing this tile ID
      for (const [spriteSetId, spriteSetResource] of spriteSetResources) {
        if (!SpriteValidator.isValidSpriteSetId(spriteSetId)) continue

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
        `[SpriteInfoResolver] Could not find sprite info for tileId ${tileId} in any sprite set`,
      )
      return null
    } catch (error) {
      console.warn('[SpriteInfoResolver] Error finding sprite info:', error)
      return null
    }
  }
}
