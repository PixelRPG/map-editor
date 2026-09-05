import type { Tile, TileMap } from 'excalibur'
import { MapEditorComponent } from '../components/map-editor.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { setSpritesAt } from './map-editor-shadow.service.ts'
import { findSpriteInfoForTileId } from './sprite-info.resolver.ts'
import { rebuildAllTileGraphics } from './tile-graphics.manager.ts'

/**
 * Layer-specific operations on tiles.
 *
 * Shadow-state lives on {@link MapEditorComponent} attached to the TileMap;
 * MapResource is only used for read-only map metadata (layers, sprite sets).
 *
 * The TileMap must already carry a `MapEditorComponent` (added when the
 * MapResource is loaded into a scene) — calling these functions before that
 * is a programmer error and surfaces as an early return + warning.
 *
 * Neither function decides depth: a painted ref carries only its layer
 * id, and the rebuild orders the cell by `MapData.layers`
 * (`services/layer-order.ts`). Before that, a paint appended to the end
 * of the cell and drew on top of every other layer until the next
 * reload — the live canvas and the saved file disagreed.
 */

export function addSpriteToTileForLayer(
  tileMap: TileMap,
  mapResource: MapResource,
  tile: Tile,
  layerId: string,
  tileId: number,
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

  setSpritesAt(editorComponent, tile.x, tile.y, layerId, [
    { spriteSetId: spriteInfo.spriteSetId, spriteId: spriteInfo.spriteId },
  ])

  rebuildAllTileGraphics(tileMap, mapResource, tile)
  // Re-derive `tile.solid` from the new sprite stack so live paints
  // during playtest immediately flip collision (was a bug: visual
  // updated but collision stayed at the load-time verdict, so
  // walking onto a freshly-painted floor on top of a solid tile
  // still blocked).
  mapResource.refreshTileSolidFromEditor(tileMap, tile)
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

  setSpritesAt(editorComponent, tile.x, tile.y, layerId, [])

  rebuildAllTileGraphics(tileMap, mapResource, tile)
  // Erase may have removed the layer's only solid sprite at this
  // tile — re-derive from whatever's left so the player can walk
  // through gaps the erase opened up.
  mapResource.refreshTileSolidFromEditor(tileMap, tile)
}
