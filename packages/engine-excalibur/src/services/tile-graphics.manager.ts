import { TileMap, Tile } from 'excalibur'
import { MapResource } from '@pixelrpg/data'

/**
 * Manager for tile graphics operations and sprite rendering
 */
export class TileGraphicsManager {
  /**
   * Get sprite from resource using sprite info
   */
  static getSpriteFromResource(
    mapResource: MapResource,
    spriteInfo: { spriteSetId: string; spriteId: number },
  ): any | null {
    try {
      const spriteSetResource = mapResource.getSpriteSetResource(
        spriteInfo.spriteSetId,
      )
      if (!spriteSetResource) return null

      if (Array.isArray(spriteSetResource.sprites)) {
        // Excalibur format
        return spriteSetResource.sprites[spriteInfo.spriteId] || null
      } else if (typeof spriteSetResource.sprites === 'object') {
        // GJS format
        return spriteSetResource.sprites[spriteInfo.spriteId] || null
      }

      return null
    } catch (error) {
      console.warn(
        '[TileGraphicsManager] Error getting sprite from resource:',
        error,
      )
      return null
    }
  }

  /**
   * Rebuild all tile graphics maintaining proper z-index ordering
   */
  static rebuildAllTileGraphics(
    tileMap: TileMap,
    mapResource: MapResource,
    tile: Tile,
  ): void {
    if (!tileMap || !mapResource || !tile) {
      console.warn(
        '[TileGraphicsManager] Invalid parameters for rebuildAllTileGraphics',
      )
      return
    }

    try {
      // Get all sprites for this tile (from all layers)
      const allSprites = mapResource.getSpritesForTileAndLayer(tile)

      // Sort all sprites by z-index for proper layering
      const sortedSprites = [...allSprites].sort(
        (a, b) => (a?.zIndex || 0) - (b?.zIndex || 0),
      )

      // Clear all graphics first
      tile.clearGraphics()

      // Rebuild all graphics in correct order
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
              console.warn(
                '[TileGraphicsManager] Error adding graphic to tile:',
                error,
              )
            }
          }
        }
      }
    } catch (error) {
      console.error(
        '[TileGraphicsManager] Error rebuilding all tile graphics:',
        error,
      )
    }
  }

  /**
   * Update TileMap z-index to ensure proper rendering order
   */
  static updateTileMapZIndex(tileMap: TileMap, mapResource: MapResource): void {
    if (!tileMap || !mapResource) return

    try {
      // Find the maximum z-index across all tiles and layers
      let maxZIndex = 0

      // First, check layer properties for maximum z-index
      if (mapResource.mapData?.layers) {
        for (const layer of mapResource.mapData.layers) {
          if (layer.properties?.['z']) {
            const layerZ = Number(layer.properties['z'])
            if (layerZ > maxZIndex) {
              maxZIndex = layerZ
            }
          }
        }
      }

      // Also check individual sprite z-index values
      for (let x = 0; x < tileMap.columns; x++) {
        for (let y = 0; y < tileMap.rows; y++) {
          const tile = tileMap.getTile(x, y)
          if (tile) {
            const sprites = mapResource.getSpritesForTileAndLayer(tile)
            for (const sprite of sprites) {
              if (sprite?.zIndex && sprite.zIndex > maxZIndex) {
                maxZIndex = sprite.zIndex
              }
            }
          }
        }
      }

      // Set TileMap z-index to be above all tile graphics
      // Use a higher multiplier to ensure proper separation between layers
      tileMap.z = maxZIndex + 100
    } catch (error) {
      console.warn(
        '[TileGraphicsManager] Error updating TileMap z-index:',
        error,
      )
    }
  }
}
