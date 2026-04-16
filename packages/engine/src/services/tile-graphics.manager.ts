import { TileMap, Tile } from 'excalibur'
import { MapResource } from '../resource/MapResource.ts'
import { MapEditorComponent } from '../components/map-editor.component.ts'

/**
 * Manager for tile graphics operations and sprite rendering.
 *
 * Reads shadow-state from {@link MapEditorComponent} on the TileMap.
 */
export class TileGraphicsManager {
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
        return spriteSetResource.sprites[spriteInfo.spriteId] || null
      } else if (typeof spriteSetResource.sprites === 'object') {
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

    const editorComponent = tileMap.get(MapEditorComponent)
    if (!editorComponent) return

    try {
      const allSprites = editorComponent.getSpritesForTileAndLayer(tile)

      const sortedSprites = [...allSprites].sort(
        (a, b) => (a?.zIndex || 0) - (b?.zIndex || 0),
      )

      tile.clearGraphics()

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

  static updateTileMapZIndex(tileMap: TileMap, mapResource: MapResource): void {
    if (!tileMap || !mapResource) return

    const editorComponent = tileMap.get(MapEditorComponent)
    if (!editorComponent) return

    try {
      let maxZIndex = 0

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

      for (let x = 0; x < tileMap.columns; x++) {
        for (let y = 0; y < tileMap.rows; y++) {
          const tile = tileMap.getTile(x, y)
          if (tile) {
            const sprites = editorComponent.getSpritesForTileAndLayer(tile)
            for (const sprite of sprites) {
              if (sprite?.zIndex && sprite.zIndex > maxZIndex) {
                maxZIndex = sprite.zIndex
              }
            }
          }
        }
      }

      tileMap.z = maxZIndex + 100
    } catch (error) {
      console.warn(
        '[TileGraphicsManager] Error updating TileMap z-index:',
        error,
      )
    }
  }
}
