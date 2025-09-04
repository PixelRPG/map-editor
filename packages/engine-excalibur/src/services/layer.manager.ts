import { TileMap, Tile } from 'excalibur'
import { MapResource } from '@pixelrpg/data-excalibur'
import { SpriteValidator } from './sprite.validator'
import { SpriteInfoResolver } from './sprite-info.resolver'
import { TileGraphicsManager } from './tile-graphics.manager'

/**
 * Manager for layer-specific operations on tiles
 */
export class LayerManager {
  /**
   * Add a sprite to a tile for a specific layer
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
      !SpriteValidator.isValidLayerId(layerId) ||
      typeof tileId !== 'number'
    ) {
      console.warn(
        '[LayerManager] Invalid input parameters for addSpriteToTileForLayer',
      )
      return
    }

    try {
      // Find sprite info for the tile ID
      const spriteInfo = SpriteInfoResolver.findSpriteInfoForTileId(
        mapResource,
        tileId,
      )
      if (!spriteInfo) {
        console.warn(
          `[LayerManager] Could not find sprite info for tileId ${tileId}`,
        )
        return
      }

      // Get existing sprites for this tile and layer
      const existingSprites = mapResource.getSpritesForTileAndLayer(
        tile,
        layerId,
      )

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

      // Create new sprite reference with proper z-index
      const newSprite = {
        spriteSetId: spriteInfo.spriteSetId,
        spriteId: spriteInfo.spriteId,
        layerId: layerId,
        zIndex: spriteZIndex,
      }

      // Replace existing sprites for this layer (set operation, not add)
      const updatedSprites = [newSprite]
      mapResource.setSpritesForTileAndLayer(tile, layerId, updatedSprites)

      // Rebuild the entire tile graphics (all layers) to maintain proper z-index ordering
      TileGraphicsManager.rebuildAllTileGraphics(tileMap, mapResource, tile)

      // Update TileMap z-index to ensure proper rendering order
      TileGraphicsManager.updateTileMapZIndex(tileMap, mapResource)
    } catch (error) {
      console.error(
        '[LayerManager] Error adding sprite to tile for layer:',
        error,
      )
    }
  }

  /**
   * Remove all sprites from a tile for a specific layer
   */
  static removeSpritesFromTileForLayer(
    tileMap: TileMap,
    mapResource: MapResource,
    tile: Tile,
    layerId: string,
  ): void {
    // Validate input parameters
    if (
      !tileMap ||
      !mapResource ||
      !tile ||
      !SpriteValidator.isValidLayerId(layerId)
    ) {
      console.warn(
        '[LayerManager] Invalid input parameters for removeSpritesFromTileForLayer',
      )
      return
    }

    try {
      // Remove all sprites for this layer
      mapResource.setSpritesForTileAndLayer(tile, layerId, [])

      // Rebuild the entire tile graphics (all layers) to maintain proper z-index ordering
      TileGraphicsManager.rebuildAllTileGraphics(tileMap, mapResource, tile)

      // Update TileMap z-index to ensure proper rendering order
      TileGraphicsManager.updateTileMapZIndex(tileMap, mapResource)
    } catch (error) {
      console.error(
        '[LayerManager] Error removing sprites from tile for layer:',
        error,
      )
    }
  }
}
