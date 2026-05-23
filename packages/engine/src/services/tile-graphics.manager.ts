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

/**
 * Build the set of layer ids whose `visible` flag is explicitly
 * `false` on the supplied resource. `undefined` counts as visible
 * (matches the old default + the `LayerDescriptor`'s `visible ?? true`
 * fallback used by the inspector).
 *
 * Cached as a `Set` because the caller is typically inside a per-tile
 * loop and a linear `.find()` per sprite would scale badly.
 */
function collectHiddenLayerIds(mapResource: MapResource): Set<string> {
  const hidden = new Set<string>()
  for (const layer of mapResource.mapData?.layers ?? []) {
    if (layer.visible === false) hidden.add(layer.id)
  }
  return hidden
}

export function rebuildAllTileGraphics(tileMap: TileMap, mapResource: MapResource, tile: Tile): void {
  const editorComponent = tileMap.get(MapEditorComponent)
  if (!editorComponent) return

  const hiddenLayerIds = collectHiddenLayerIds(mapResource)
  const allSprites = editorComponent.getSpritesForTileAndLayer(tile)
  // Filter out sprites whose layer is hidden — they stay in the
  // shadow state (so toggling visibility back on is a pure graphics
  // rebuild without re-loading from JSON) but we skip them at render.
  const visibleSprites = allSprites.filter((s) => !hiddenLayerIds.has(s.layerId))
  const sortedSprites = [...visibleSprites].sort((a, b) => (a?.zIndex || 0) - (b?.zIndex || 0))

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

/**
 * Rebuild graphics on every tile in the supplied `TileMap`. Used after
 * a global state change that affects rendering for many tiles at once
 * — currently: toggling `layer.visible` on a layer. Pairs the per-tile
 * rebuild with a single z-index pass at the end so the maximum
 * z-index of the tilemap reflects all (visible) sprites.
 *
 * Hot for huge maps — O(columns × rows) tiles, each iterating its
 * sprite list — but called only on explicit user toggles, not per
 * frame.
 */
export function refreshAllTileGraphics(tileMap: TileMap, mapResource: MapResource): void {
  for (let x = 0; x < tileMap.columns; x++) {
    for (let y = 0; y < tileMap.rows; y++) {
      const tile = tileMap.getTile(x, y)
      if (!tile) continue
      rebuildAllTileGraphics(tileMap, mapResource, tile)
    }
  }
  updateTileMapZIndex(tileMap, mapResource)
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
