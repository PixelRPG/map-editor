import type { Tile, TileMap } from 'excalibur'
import { MapEditorComponent } from '../components/map-editor.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { findSpriteInfoForTileId } from './sprite-info.resolver.ts'
import { rebuildAllTileGraphics, updateTileMapZIndex } from './tile-graphics.manager.ts'

/**
 * Layer-specific operations on tiles.
 *
 * Shadow-state lives on {@link MapEditorComponent} attached to the TileMap;
 * MapResource is only used for read-only map metadata (layers, sprite sets).
 *
 * The TileMap must already carry a `MapEditorComponent` (added when the
 * MapResource is loaded into a scene) — calling these functions before that
 * is a programmer error and surfaces as an early return + warning.
 */

export function addSpriteToTileForLayer(
  tileMap: TileMap,
  mapResource: MapResource,
  tile: Tile,
  layerId: string,
  tileId: number,
  zIndex?: number,
): void {
  const editorComponent = tileMap.get(MapEditorComponent)
  if (!editorComponent) {
    console.warn('[LayerManager] TileMap has no MapEditorComponent — MapResource must be added to a scene first')
    return
  }

  const spriteInfo = findSpriteInfoForTileId(mapResource, tileId)
  if (!spriteInfo) {
    console.warn(`[LayerManager] Could not find sprite info for tileId ${tileId}`)
    return
  }

  let spriteZIndex = zIndex || 0
  if (spriteZIndex === 0) {
    const layerData = mapResource.mapData.layers.find((l) => l.id === layerId)
    if (layerData?.properties?.z) {
      spriteZIndex = Number(layerData.properties.z)
    }
  }

  editorComponent.setSpritesForTileAndLayer(tile, layerId, [
    {
      spriteSetId: spriteInfo.spriteSetId,
      spriteId: spriteInfo.spriteId,
      zIndex: spriteZIndex,
    },
  ])

  rebuildAllTileGraphics(tileMap, mapResource, tile)
  updateTileMapZIndex(tileMap, mapResource)
}

export function removeSpritesFromTileForLayer(
  tileMap: TileMap,
  mapResource: MapResource,
  tile: Tile,
  layerId: string,
): void {
  const editorComponent = tileMap.get(MapEditorComponent)
  if (!editorComponent) {
    console.warn('[LayerManager] TileMap has no MapEditorComponent — MapResource must be added to a scene first')
    return
  }

  editorComponent.setSpritesForTileAndLayer(tile, layerId, [])

  rebuildAllTileGraphics(tileMap, mapResource, tile)
  updateTileMapZIndex(tileMap, mapResource)
}
