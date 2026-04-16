import { TileMap, Tile } from 'excalibur'
import { MapResource } from '../resource/MapResource.ts'
import { MapEditorComponent } from '../components/map-editor.component.ts'
import { SpriteValidator } from './sprite.validator'
import { SpriteInfoResolver } from './sprite-info.resolver'
import { TileGraphicsManager } from './tile-graphics.manager'

/**
 * Manager for layer-specific operations on tiles.
 *
 * Shadow-state lives on {@link MapEditorComponent} attached to the TileMap;
 * MapResource is only used for read-only map metadata (layers, sprite sets).
 */
export class LayerManager {
  static addSpriteToTileForLayer(
    tileMap: TileMap,
    mapResource: MapResource,
    tile: Tile,
    layerId: string,
    tileId: number,
    zIndex?: number,
  ): void {
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

    const editorComponent = tileMap.get(MapEditorComponent)
    if (!editorComponent) {
      console.warn(
        '[LayerManager] TileMap has no MapEditorComponent — MapResource must be added to a scene first',
      )
      return
    }

    try {
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

      let spriteZIndex = zIndex || 0
      if (spriteZIndex === 0) {
        const layerData = mapResource.mapData.layers.find(
          (l) => l.id === layerId,
        )
        if (layerData?.properties?.['z']) {
          spriteZIndex = Number(layerData.properties['z'])
        }
      }

      const newSprite = {
        spriteSetId: spriteInfo.spriteSetId,
        spriteId: spriteInfo.spriteId,
        zIndex: spriteZIndex,
      }

      editorComponent.setSpritesForTileAndLayer(tile, layerId, [newSprite])

      TileGraphicsManager.rebuildAllTileGraphics(tileMap, mapResource, tile)
      TileGraphicsManager.updateTileMapZIndex(tileMap, mapResource)
    } catch (error) {
      console.error(
        '[LayerManager] Error adding sprite to tile for layer:',
        error,
      )
    }
  }

  static removeSpritesFromTileForLayer(
    tileMap: TileMap,
    mapResource: MapResource,
    tile: Tile,
    layerId: string,
  ): void {
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

    const editorComponent = tileMap.get(MapEditorComponent)
    if (!editorComponent) {
      console.warn(
        '[LayerManager] TileMap has no MapEditorComponent — MapResource must be added to a scene first',
      )
      return
    }

    try {
      editorComponent.setSpritesForTileAndLayer(tile, layerId, [])

      TileGraphicsManager.rebuildAllTileGraphics(tileMap, mapResource, tile)
      TileGraphicsManager.updateTileMapZIndex(tileMap, mapResource)
    } catch (error) {
      console.error(
        '[LayerManager] Error removing sprites from tile for layer:',
        error,
      )
    }
  }
}
