import { Graphic, Sprite } from 'excalibur'
import { TileMap, Tile } from 'excalibur'
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
   * Rebuild tile graphics for a specific layer only
   * This method only affects the graphics for the specified layer, leaving other layers untouched
   * @param tileMap The TileMap containing the tile
   * @param mapResource The MapResource with sprite data
   * @param tile The tile to rebuild graphics for
   * @param layerId The layer ID to rebuild graphics for
   */
  static rebuildTileGraphicsForLayer(
    tileMap: TileMap,
    mapResource: MapResource,
    tile: Tile,
    layerId: string,
  ): void {
    // Validate input parameters
    if (!tileMap || !mapResource || !tile || !layerId) {
      console.warn(
        '[SpriteUtils] Invalid input parameters for rebuildTileGraphicsForLayer',
      )
      return
    }

    try {
      // Get current graphics and layer sprites
      const currentGraphics = tile.getGraphics()
      const layerSprites = mapResource.getSpritesForTileAndLayer(tile, layerId)

      if (!Array.isArray(layerSprites)) {
        console.warn('[SpriteUtils] Invalid sprites data for layer:', layerId)
        return
      }

      // Remove existing graphics for this layer only
      // We need to identify which graphics belong to this layer
      const graphicsToKeep: Graphic[] = []
      const graphicsToRemove: Graphic[] = []

      // Get all sprites for this tile (from all layers)
      const allSprites = mapResource.getSpritesForTileAndLayer(tile)

      // Sort all sprites by z-index for proper layering
      const sortedAllSprites = [...allSprites].sort(
        (a, b) => (a?.zIndex || 0) - (b?.zIndex || 0),
      )

      // Clear all graphics first, then rebuild them properly
      tile.clearGraphics()

      // Rebuild all graphics in correct order
      for (const spriteInfo of sortedAllSprites) {
        if (
          spriteInfo?.spriteSetId &&
          typeof spriteInfo.spriteId === 'number'
        ) {
          const graphic = this.getSpriteFromResource(mapResource, spriteInfo)
          if (graphic) {
            try {
              tile.addGraphic(graphic)
            } catch (error) {
              console.warn('[SpriteUtils] Error adding graphic to tile:', error)
            }
          }
        }
      }
    } catch (error) {
      console.error(
        '[SpriteUtils] Error rebuilding tile graphics for layer:',
        layerId,
        error,
      )
    }
  }

  /**
   * Add a sprite to a tile for a specific layer
   * @param tileMap The TileMap containing the tile
   * @param mapResource The MapResource with sprite data
   * @param tile The tile to modify
   * @param layerId The layer ID
   * @param tileId The global tile ID to add
   * @param zIndex Optional z-index for the sprite
   */
  static addSpriteToTileForLayer(
    tileMap: TileMap,
    mapResource: MapResource,
    tile: Tile,
    layerId: string,
    tileId: number,
    zIndex?: number,
  ): void {
    // Validate input parameters
    if (
      !tileMap ||
      !mapResource ||
      !tile ||
      !layerId ||
      typeof tileId !== 'number'
    ) {
      console.warn(
        '[SpriteUtils] Invalid input parameters for addSpriteToTileForLayer',
      )
      return
    }

    try {
      // Find sprite info for the tile ID
      const spriteInfo = this.findSpriteInfoForTileId(mapResource, tileId)
      if (!spriteInfo) {
        console.warn(
          `[SpriteUtils] Could not find sprite info for tileId ${tileId}`,
        )
        return
      }

      // Get existing sprites for this tile and layer
      const existingSprites = mapResource.getSpritesForTileAndLayer(
        tile,
        layerId,
      )

      // Create new sprite reference
      const newSprite = {
        spriteSetId: spriteInfo.spriteSetId,
        spriteId: spriteInfo.spriteId,
        layerId: layerId,
        zIndex: zIndex || 0,
      }

      // Add the new sprite
      const updatedSprites = [...existingSprites, newSprite]
      mapResource.setSpritesForTileAndLayer(tile, layerId, updatedSprites)

      // Rebuild the entire tile graphics (all layers) to maintain proper z-index ordering
      this.rebuildAllTileGraphics(tileMap, mapResource, tile)

      // Update TileMap z-index to ensure proper rendering order
      this.updateTileMapZIndex(tileMap, mapResource)
    } catch (error) {
      console.error(
        '[SpriteUtils] Error adding sprite to tile for layer:',
        error,
      )
    }
  }

  /**
   * Remove all sprites from a tile for a specific layer
   * @param tileMap The TileMap containing the tile
   * @param mapResource The MapResource with sprite data
   * @param tile The tile to modify
   * @param layerId The layer ID
   */
  static removeSpritesFromTileForLayer(
    tileMap: TileMap,
    mapResource: MapResource,
    tile: Tile,
    layerId: string,
  ): void {
    // Validate input parameters
    if (!tileMap || !mapResource || !tile || !layerId) {
      console.warn(
        '[SpriteUtils] Invalid input parameters for removeSpritesFromTileForLayer',
      )
      return
    }

    try {
      // Clear sprites for this layer
      mapResource.clearSpritesForTileAndLayer(tile, layerId)

      // Rebuild the entire tile graphics (all layers) to maintain proper z-index ordering
      this.rebuildAllTileGraphics(tileMap, mapResource, tile)

      // Update TileMap z-index to ensure proper rendering order
      this.updateTileMapZIndex(tileMap, mapResource)
    } catch (error) {
      console.error(
        '[SpriteUtils] Error removing sprites from tile for layer:',
        error,
      )
    }
  }

  /**
   * Replace sprite on a tile for a specific layer
   * @param tileMap The TileMap containing the tile
   * @param mapResource The MapResource with sprite data
   * @param tile The tile to modify
   * @param layerId The layer ID
   * @param tileId The global tile ID to set (0 to clear)
   * @param zIndex Optional z-index for the sprite
   */
  static setSpriteOnTileForLayer(
    tileMap: TileMap,
    mapResource: MapResource,
    tile: Tile,
    layerId: string,
    tileId: number,
    zIndex?: number,
  ): void {
    // Validate input parameters
    if (
      !tileMap ||
      !mapResource ||
      !tile ||
      !layerId ||
      typeof tileId !== 'number'
    ) {
      console.warn(
        '[SpriteUtils] Invalid input parameters for setSpriteOnTileForLayer',
      )
      return
    }

    try {
      // If tileId is 0, clear the layer
      if (tileId === 0) {
        this.removeSpritesFromTileForLayer(tileMap, mapResource, tile, layerId)
        return
      }

      // Find sprite info for the tile ID
      const spriteInfo = this.findSpriteInfoForTileId(mapResource, tileId)
      if (!spriteInfo) {
        console.warn(
          `[SpriteUtils] Could not find sprite info for tileId ${tileId}`,
        )
        return
      }

      // Debug: Found sprite info

      // Get layer z-index from map data if not provided
      let spriteZIndex = zIndex || 0
      if (spriteZIndex === 0) {
        // Try to get z-index from layer properties
        const layerData = mapResource.mapData.layers.find(
          (l) => l.id === layerId,
        )
        if (layerData?.properties?.['z']) {
          spriteZIndex = Number(layerData.properties['z'])
        }
      }

      // Create new sprite reference
      const newSprite = {
        spriteSetId: spriteInfo.spriteSetId,
        spriteId: spriteInfo.spriteId,
        layerId: layerId,
        zIndex: spriteZIndex,
      }

      // Set sprites for this layer (replaces existing sprites for this layer)
      mapResource.setSpritesForTileAndLayer(tile, layerId, [newSprite])

      // Verify sprites are stored correctly
      const storedSprites = mapResource.getSpritesForTileAndLayer(tile)

      // Rebuild the entire tile graphics (all layers) to maintain proper z-index ordering
      this.rebuildAllTileGraphics(tileMap, mapResource, tile)

      // Update TileMap z-index to ensure proper rendering order
      this.updateTileMapZIndex(tileMap, mapResource)
    } catch (error) {
      console.error(
        '[SpriteUtils] Error setting sprite on tile for layer:',
        error,
      )
    }
  }

  /**
   * Update TileMap z-index based on all tiles in the map
   * This ensures proper rendering order between different TileMaps
   * @param tileMap The TileMap to update
   * @param mapResource The MapResource with sprite data
   */
  static updateTileMapZIndex(tileMap: TileMap, mapResource: MapResource): void {
    try {
      let maxZIndex = 0

      // Iterate through all tiles to find the highest z-index
      for (let x = 0; x < tileMap.columns; x++) {
        for (let y = 0; y < tileMap.rows; y++) {
          const tile = tileMap.getTile(x, y)
          if (tile) {
            const sprites = mapResource.getSpritesForTileAndLayer(tile)
            const tileMaxZ = Math.max(...sprites.map((s) => s.zIndex || 0))
            maxZIndex = Math.max(maxZIndex, tileMaxZ)
          }
        }
      }

      if (maxZIndex > 0) {
        tileMap.z = maxZIndex * 1000
      }
    } catch (error) {
      console.warn('[SpriteUtils] Error updating TileMap z-index:', error)
    }
  }

  /**
   * Rebuild all graphics for a tile from all layers
   * This ensures proper z-index ordering across all layers
   * @param tileMap The TileMap containing the tile
   * @param mapResource The MapResource with sprite data
   * @param tile The tile to rebuild graphics for
   */
  static rebuildAllTileGraphics(
    tileMap: TileMap,
    mapResource: MapResource,
    tile: Tile,
  ): void {
    // Validate input parameters
    if (!tileMap || !mapResource || !tile) {
      console.warn(
        '[SpriteUtils] Invalid input parameters for rebuildAllTileGraphics',
      )
      return
    }

    try {
      // Clear all existing graphics
      tile.clearGraphics()

      // Get all sprites for this tile (from all layers)
      const allSprites = mapResource.getSpritesForTileAndLayer(tile)

      // Sort all sprites by z-index for proper layering (lower z-index first)
      const sortedSprites = [...allSprites].sort(
        (a, b) => (a?.zIndex || 0) - (b?.zIndex || 0),
      )

      // Check if we have any sprites with different z-index values
      const zIndices = sortedSprites.map((s) => s.zIndex || 0)

      // Note: TileMap z-index is updated separately in updateTileMapZIndex method

      // Add graphics for each sprite in correct order

      for (const spriteInfo of sortedSprites) {
        if (
          spriteInfo?.spriteSetId &&
          typeof spriteInfo.spriteId === 'number'
        ) {
          const graphic = this.getSpriteFromResource(mapResource, spriteInfo)
          if (graphic) {
            try {
              tile.addGraphic(graphic)
            } catch (error) {
              console.warn('[SpriteUtils] Error adding graphic to tile:', error)
            }
          } else {
            console.warn(
              `[SpriteUtils] Failed to get graphic for sprite ${spriteInfo.spriteSetId}:${spriteInfo.spriteId}`,
            )
          }
        }
      }

      // Update TileMap z-index after rebuilding graphics
      this.updateTileMapZIndex(tileMap, mapResource)
    } catch (error) {
      console.error('[SpriteUtils] Error rebuilding all tile graphics:', error)
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

      if (!spriteSetResource.sprites) {
        console.warn(
          `[SpriteUtils] Sprite set resource has no sprites: ${spriteInfo.spriteSetId}`,
        )
        return null
      }

      let sprite: Sprite | null = null

      if (Array.isArray(spriteSetResource.sprites)) {
        // Excalibur format: sprites is an array
        sprite = spriteSetResource.sprites[spriteInfo.spriteId]
      } else if (typeof spriteSetResource.sprites === 'object') {
        // GJS format: sprites is a Record<number, Sprite>
        sprite = spriteSetResource.sprites[spriteInfo.spriteId]
      }

      if (sprite) {
        return sprite.clone()
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
