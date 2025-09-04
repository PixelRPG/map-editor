import { Sprite, Canvas } from 'excalibur'
import { TileMap, Tile } from 'excalibur'
import {
  EDITOR_CONSTANTS,
  getFallbackColor,
  areTileDimensionsValid,
} from './constants.ts'

/**
 * Utility class for sprite management and tile graphics operations
 */
export class SpriteUtils {
  /**
   * Find sprite set ID and sprite ID for a given global tile ID
   * @param mapResource The MapResource to search
   * @param globalTileId The global tile ID to find
   * @returns Object with spriteSetId and spriteId, or null if not found
   */
  static findSpriteInfoForTileId(
    mapResource: any,
    globalTileId: number,
  ): { spriteSetId: string; spriteId: number } | null {
    // Validate input parameters
    if (!mapResource) {
      console.warn('[SpriteUtils] No mapResource provided')
      return null
    }

    if (typeof globalTileId !== 'number' || globalTileId < 0) {
      console.warn(`[SpriteUtils] Invalid globalTileId: ${globalTileId}`)
      return null
    }

    let spriteSetResources: Map<string, any>
    let mapData: any

    try {
      spriteSetResources = mapResource.getAllSpriteSetResources()
      mapData = mapResource.mapData
    } catch (error) {
      console.warn('[SpriteUtils] Error accessing map resource data:', error)
      return null
    }

    if (!spriteSetResources || !mapData) {
      console.warn('[SpriteUtils] Invalid map resource data')
      return null
    }

    if (!mapData.spriteSets || !Array.isArray(mapData.spriteSets)) {
      console.warn('[SpriteUtils] Invalid sprite sets data')
      return null
    }

    // Iterate through sprite sets to find the one containing this global tile ID
    for (const [spriteSetId, spriteSetResource] of spriteSetResources) {
      if (!spriteSetId || typeof spriteSetId !== 'string') {
        console.warn('[SpriteUtils] Invalid sprite set ID:', spriteSetId)
        continue
      }

      const spriteSetRef = mapData.spriteSets.find(
        (ref: any) => ref && ref.id === spriteSetId,
      )
      if (!spriteSetRef) {
        console.warn(`[SpriteUtils] No sprite set ref found for ${spriteSetId}`)
        continue
      }

      if (typeof spriteSetRef.firstGid !== 'number') {
        console.warn(
          `[SpriteUtils] Invalid firstGid for sprite set ${spriteSetId}`,
        )
        continue
      }

      const firstGid = spriteSetRef.firstGid
      if (!spriteSetResource || !spriteSetResource.sprites) {
        console.warn(
          `[SpriteUtils] Invalid sprite set resource for ${spriteSetId}`,
        )
        continue
      }

      // Calculate the number of sprites and last GID
      let spriteCount = 0
      if (Array.isArray(spriteSetResource.sprites)) {
        // Excalibur format: sprites is an array
        spriteCount = spriteSetResource.sprites.length
      } else if (
        spriteSetResource.sprites &&
        typeof spriteSetResource.sprites === 'object'
      ) {
        // GJS format: sprites is a Record<number, Sprite>
        const spriteIds = Object.keys(spriteSetResource.sprites).map((id) =>
          parseInt(id),
        )
        if (spriteIds.length > 0) {
          spriteCount = Math.max(...spriteIds) + 1 // Find the maximum sprite ID + 1
        } else {
          spriteCount = 0
        }
      }

      const lastGid = firstGid + spriteCount - 1

      // Check if the global tile ID falls within this sprite set's range
      if (globalTileId >= firstGid && globalTileId <= lastGid) {
        const localSpriteId = globalTileId - firstGid

        // Additional validation: check if the sprite actually exists
        let spriteExists = false
        if (Array.isArray(spriteSetResource.sprites)) {
          // Excalibur format
          spriteExists = !!spriteSetResource.sprites[localSpriteId]
        } else if (
          spriteSetResource.sprites &&
          typeof spriteSetResource.sprites === 'object'
        ) {
          // GJS format
          spriteExists = !!spriteSetResource.sprites[localSpriteId]
        }

        if (!spriteExists) {
          console.warn(
            `[SpriteUtils] Sprite ${localSpriteId} not found in sprite set ${spriteSetId}, even though tileId ${globalTileId} is in range`,
          )
          continue // Try next sprite set
        }

        return {
          spriteSetId: spriteSetId,
          spriteId: localSpriteId,
        }
      }
    }

    console.warn(
      `[SpriteUtils] Could not find sprite info for tileId ${globalTileId} in any sprite set`,
    )
    return null
  }

  /**
   * Get a sprite for the given tile ID from the TileMap's sprite sheets
   * @param tileMap The TileMap to get sprite from
   * @param tileId The tile ID to look for
   * @returns The sprite if found, null otherwise
   */
  static getSpriteForTile(tileMap: TileMap, tileId: number): Sprite | null {
    // Validate input parameters
    if (!tileMap) {
      console.warn('[SpriteUtils] No tileMap provided')
      return null
    }

    if (typeof tileId !== 'number' || tileId < 0) {
      console.warn(`[SpriteUtils] Invalid tileId: ${tileId}`)
      return null
    }

    try {
      // Try to access the MapResource stored on the TileMap
      const mapResource = (tileMap as any).mapResource
      if (!mapResource) {
        console.warn('[SpriteUtils] No MapResource found on TileMap')
        return null
      }

      // Get all sprite set resources
      const spriteSetResources = mapResource.getAllSpriteSetResources()
      if (
        !spriteSetResources ||
        typeof spriteSetResources[Symbol.iterator] !== 'function'
      ) {
        console.warn('[SpriteUtils] Invalid sprite set resources')
        return null
      }

      // Try to find the sprite in any of the sprite sets
      for (const [spriteSetId, spriteSetResource] of spriteSetResources) {
        if (!spriteSetResource || !spriteSetResource.sprites) {
          continue
        }

        // Support both array format (Excalibur) and record format (GJS)
        let sprite = null
        if (Array.isArray(spriteSetResource.sprites)) {
          // Excalibur format: sprites is an array
          sprite = spriteSetResource.sprites[tileId]
        } else if (typeof spriteSetResource.sprites === 'object') {
          // GJS format: sprites is a Record<number, Sprite>
          sprite = spriteSetResource.sprites[tileId]
        }

        if (sprite) {
          return sprite
        }
      }

      console.warn(`[SpriteUtils] Sprite ${tileId} not found in any sprite set`)
      return null
    } catch (error) {
      console.error('[SpriteUtils] Error getting sprite for tile:', error)
      return null
    }
  }

  /**
   * Apply a fallback tile when no real sprite is available
   * @param tileMap The TileMap containing the tile
   * @param tile The tile to modify
   * @param tileId The tile ID to represent with fallback
   * @param layerId The layer ID for this tile
   */
  static applyFallbackTile(
    tileMap: TileMap,
    tile: Tile,
    tileId: number,
    layerId: string,
  ): void {
    // Validate input parameters
    if (!tileMap) {
      console.warn('[SpriteUtils] No tileMap provided')
      return
    }

    if (!tile) {
      console.warn('[SpriteUtils] No tile provided')
      return
    }

    if (typeof tileId !== 'number') {
      console.warn(`[SpriteUtils] Invalid tileId: ${tileId}`)
      return
    }

    if (!layerId || typeof layerId !== 'string') {
      console.warn(`[SpriteUtils] Invalid layerId: ${layerId}`)
      return
    }

    try {
      // Clear existing graphics
      tile.clearGraphics()

      const tileWidth = tileMap.tileWidth
      const tileHeight = tileMap.tileHeight

      // Validate tile dimensions
      if (tileWidth <= 0 || tileHeight <= 0) {
        console.warn(
          `[SpriteUtils] Invalid tile dimensions: ${tileWidth}x${tileHeight}`,
        )
        return
      }

      const fallbackGraphic = new Canvas({
        width: tileWidth,
        height: tileHeight,
        draw: (ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = getFallbackColor(tileId)
          ctx.fillRect(0, 0, tileWidth, tileHeight)

          // Add border for visibility
          ctx.strokeStyle = '#000000'
          ctx.lineWidth = 1
          ctx.strokeRect(0, 0, tileWidth, tileHeight)

          // Add tile ID text
          ctx.fillStyle = '#000000'
          ctx.font = '10px Arial'
          ctx.textAlign = 'center'
          ctx.fillText(tileId.toString(), tileWidth / 2, tileHeight / 2 + 3)
        },
      })

      // Add the fallback graphic to the tile
      tile.addGraphic(fallbackGraphic)

      // Update tile properties
      tile.solid = tileId > 0
      tile.data.set('tileId', tileId)
    } catch (error) {
      console.error('[SpriteUtils] Error applying fallback tile:', error)
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
    mapResource: any,
    tile: Tile,
  ): void {
    // Validate input parameters
    if (!tileMap) {
      console.warn('[SpriteUtils] No tileMap provided')
      return
    }

    if (!mapResource) {
      console.warn('[SpriteUtils] No mapResource provided')
      return
    }

    if (!tile) {
      console.warn('[SpriteUtils] No tile provided')
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
      const sortedSprites = allSprites.sort((a, b) => {
        const aZ = a && typeof a.zIndex === 'number' ? a.zIndex : 0
        const bZ = b && typeof b.zIndex === 'number' ? b.zIndex : 0
        return aZ - bZ
      })

      // Add graphics for each sprite
      for (const spriteInfo of sortedSprites) {
        if (
          !spriteInfo ||
          !spriteInfo.spriteSetId ||
          typeof spriteInfo.spriteId !== 'number'
        ) {
          console.warn('[SpriteUtils] Invalid sprite info:', spriteInfo)
          continue
        }

        const spriteSetResource = mapResource.getSpriteSetResource(
          spriteInfo.spriteSetId,
        )
        if (!spriteSetResource) {
          console.warn(
            `[SpriteUtils] Sprite set resource not found: ${spriteInfo.spriteSetId}`,
          )
          continue
        }

        let graphic: any = null

        // Try to get the sprite
        if (
          spriteSetResource.sprites &&
          spriteSetResource.sprites[spriteInfo.spriteId]
        ) {
          try {
            graphic = spriteSetResource.sprites[spriteInfo.spriteId].clone()
          } catch (error) {
            console.warn(
              `[SpriteUtils] Error cloning sprite ${spriteInfo.spriteId}:`,
              error,
            )
          }
        }

        // If sprite not found, create fallback
        if (!graphic) {
          console.warn(
            `[SpriteUtils] Could not find sprite ${spriteInfo.spriteId} in sprite set ${spriteInfo.spriteSetId}, using fallback`,
          )
          const tileWidth = tileMap.tileWidth
          const tileHeight = tileMap.tileHeight

          // Validate tile dimensions
          if (!areTileDimensionsValid(tileWidth, tileHeight)) {
            console.warn(
              `[SpriteUtils] Invalid tile dimensions: ${tileWidth}x${tileHeight}`,
            )
            continue
          }

          try {
            graphic = new Canvas({
              width: tileWidth,
              height: tileHeight,
              draw: (ctx: CanvasRenderingContext2D) => {
                ctx.fillStyle = getFallbackColor(spriteInfo.spriteId)
                ctx.fillRect(0, 0, tileWidth, tileHeight)
                ctx.strokeStyle = '#000000'
                ctx.lineWidth = 1
                ctx.strokeRect(0, 0, tileWidth, tileHeight)
              },
            })
          } catch (error) {
            console.warn(
              '[SpriteUtils] Error creating fallback graphic:',
              error,
            )
            continue
          }
        }

        // Add the graphic to the tile
        try {
          tile.addGraphic(graphic)
        } catch (error) {
          console.warn('[SpriteUtils] Error adding graphic to tile:', error)
        }
      }
    } catch (error) {
      console.error('[SpriteUtils] Error rebuilding tile graphics:', error)
    }
  }
}
