import { Actor, TileMap } from 'excalibur'
import { MapEditorComponent, TileMapPlaneComponent, TileTransformComponent, zFor } from '../components/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import type { LayerPlane } from '../types/data/index.ts'
import { getSpritesAt, setSpritesAt } from './map-editor-shadow.service.ts'
import { rebuildAllTileGraphics } from './tile-graphics.manager.ts'

/**
 * Carry a layer's live content from one plane's tilemap to another's.
 *
 * At runtime a layer's sprites do not live "on the layer": they sit in
 * the shadow (`MapEditorComponent.sprites`) of the tilemap of the
 * layer's PLANE, keyed by cell and tagged with the layer id, and its
 * placements are actors whose z was pinned from the plane at spawn.
 * Changing `LayerData.plane` alone would therefore leave every sprite
 * drawing on the old tilemap — the field and the picture would disagree,
 * which is exactly the silent class the plane model exists to end.
 *
 * Runs once per {@link SetLayerPlaneCommand} application; walks only
 * the cells the source shadow holds, and re-derives `tile.solid` on
 * both tilemaps for each moved cell so collision follows the sprites.
 * A missing tilemap (a map not yet realised) is a no-op — the field
 * write in the command still lands, and the next `addToScene` builds
 * the shadow from the map data, plane-correct.
 */
export function movePlaneOfLayer(scene: MapScene, layerId: string, from: LayerPlane, to: LayerPlane): void {
  if (from === to) return
  const source = tileMapForPlane(scene, from)
  const target = tileMapForPlane(scene, to)
  const sourceEditor = source?.get(MapEditorComponent)
  const targetEditor = target?.get(MapEditorComponent)
  const mapResource = scene.mapResource
  if (source && target && sourceEditor && targetEditor) {
    // Snapshot the keys first: `setSpritesAt` deletes an emptied cell
    // from the record we would otherwise be iterating.
    for (const key of Object.keys(sourceEditor.sprites)) {
      const [x, y] = key.split(',').map(Number)
      const refs = getSpritesAt(sourceEditor, x, y, layerId)
      if (refs.length === 0) continue
      setSpritesAt(sourceEditor, x, y, layerId, [])
      setSpritesAt(targetEditor, x, y, layerId, refs)
      for (const tileMap of [source, target]) {
        const tile = tileMap.getTile(x, y)
        if (!tile) continue
        rebuildAllTileGraphics(tileMap, mapResource, tile)
        mapResource.refreshTileSolidFromEditor(tileMap, tile)
      }
    }
  }
  // Placement actors carry the layer id on `TileTransformComponent`;
  // their z was `zFor(plane)` at spawn (`entity/spawn-placement.ts`).
  for (const entity of scene.world.entityManager.entities) {
    if (entity instanceof Actor && entity.get(TileTransformComponent)?.layerId === layerId) entity.z = zFor(to)
  }
}

/** The scene's tilemap for `plane`, or `null` before the map is realised. */
function tileMapForPlane(scene: MapScene, plane: LayerPlane): TileMap | null {
  for (const entity of scene.world.entityManager.entities) {
    if (entity instanceof TileMap && entity.get(TileMapPlaneComponent)?.plane === plane) return entity
  }
  return null
}
