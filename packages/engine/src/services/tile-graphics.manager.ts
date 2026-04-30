import type { Tile, TileMap } from 'excalibur'
import { MapEditorComponent } from '../components/map-editor.component.ts'
import type { MapResource } from '../resource/MapResource.ts'

/**
 * Tile graphics operations and sprite rendering.
 *
 * Read shadow-state from {@link MapEditorComponent} on the TileMap.
 * The TileMap's `MapEditorComponent` is added when the MapResource enters a
 * scene; calling these functions before that point is a programmer error and
 * surfaces as an early return + warning.
 */

export function getSpriteFromResource(
  mapResource: MapResource,
  spriteInfo: { spriteSetId: string; spriteId: number },
): unknown | null {
  const spriteSetResource = mapResource.getSpriteSetResource(spriteInfo.spriteSetId)
  if (!spriteSetResource) return null
  return spriteSetResource.sprites[spriteInfo.spriteId] ?? null
}

export function rebuildAllTileGraphics(tileMap: TileMap, mapResource: MapResource, tile: Tile): void {
  const editorComponent = tileMap.get(MapEditorComponent)
  if (!editorComponent) return

  const allSprites = editorComponent.getSpritesForTileAndLayer(tile)
  const sortedSprites = [...allSprites].sort((a, b) => (a?.zIndex || 0) - (b?.zIndex || 0))

  tile.clearGraphics()

  for (const spriteInfo of sortedSprites) {
    if (spriteInfo?.spriteSetId && typeof spriteInfo.spriteId === 'number') {
      const graphic = getSpriteFromResource(mapResource, spriteInfo)
      if (graphic) {
        try {
          tile.addGraphic(graphic as Parameters<Tile['addGraphic']>[0])
        } catch (error) {
          // Single-sprite failure shouldn't abort the whole rebuild; log with
          // enough context to debug, then continue.
          console.error(
            `[TileGraphicsManager] Failed to add graphic ${spriteInfo.spriteSetId}#${spriteInfo.spriteId} to tile:`,
            error,
          )
        }
      }
    }
  }
}

export function updateTileMapZIndex(tileMap: TileMap, mapResource: MapResource): void {
  const editorComponent = tileMap.get(MapEditorComponent)
  if (!editorComponent) return

  let maxZIndex = 0

  for (const layer of mapResource.mapData?.layers ?? []) {
    if (layer.properties?.z) {
      const layerZ = Number(layer.properties.z)
      if (layerZ > maxZIndex) {
        maxZIndex = layerZ
      }
    }
  }

  for (let x = 0; x < tileMap.columns; x++) {
    for (let y = 0; y < tileMap.rows; y++) {
      const tile = tileMap.getTile(x, y)
      if (!tile) continue
      for (const sprite of editorComponent.getSpritesForTileAndLayer(tile)) {
        if (sprite?.zIndex && sprite.zIndex > maxZIndex) {
          maxZIndex = sprite.zIndex
        }
      }
    }
  }

  tileMap.z = maxZIndex + 100
}
