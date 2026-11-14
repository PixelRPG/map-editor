import type { LayerContentPayload } from '../commands/layer-content.command.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import type { LayerData, ObjectPlacement, SpriteDataMap } from '../types/data/index.ts'
import { getSpritesAt, iterateOccupiedCoords } from './map-editor-shadow.service.ts'
import { findTileMapForLayer } from './tile-paint.service.ts'

/**
 * Collect everything that belongs to one layer into a single
 * transport-friendly payload — the input both layer-content commands
 * need.
 *
 * It exists because a layer's content is split across three places at
 * runtime: the layer itself sits in `MapData.layers`, its tiles sit in
 * the shadow of its PLANE's tilemap (synced back into
 * `LayerData.sprites` only on save), and its placements sit on
 * `MapData.objectPlacements`. A command that has to reconstruct the
 * layer on undo, or on a peer, cannot go looking for content that by
 * then is gone — so the caller snapshots all three at dispatch time.
 */
export function snapshotLayerContent(scene: MapScene, layerId: string): LayerContentPayload | null {
  const layers = scene.mapResource?.mapData?.layers
  const index = layers?.findIndex((layer) => layer.id === layerId) ?? -1
  if (!layers || index < 0) return null

  return {
    layer: { ...layers[index], sprites: snapshotSprites(scene, layerId) },
    index,
    placements: (scene.mapResource?.mapData?.objectPlacements ?? [])
      .filter((placement) => placement.layerId === layerId)
      .map((placement) => ({ ...placement })),
  }
}

/**
 * Re-id a snapshot for a duplicate: the copy is a NEW layer, so it
 * needs its own layer id and a fresh id per placement (stable ids are
 * the only keys the transport has — reusing one would make the copy and
 * the original the same object to every peer). `mintPlacementId` is
 * injected so the engine stays free of the maker's id conventions.
 */
export function reidLayerContent(
  content: LayerContentPayload,
  layer: Pick<LayerData, 'id' | 'name'>,
  mintPlacementId: (placement: ObjectPlacement) => string,
): LayerContentPayload {
  return {
    layer: { ...content.layer, id: layer.id, name: layer.name },
    index: content.index + 1,
    placements: content.placements.map((placement) => ({
      ...placement,
      id: mintPlacementId(placement),
      layerId: layer.id,
    })),
  }
}

/** The layer's live tiles, read out of its plane's shadow into map-file shape. */
function snapshotSprites(scene: MapScene, layerId: string): SpriteDataMap[] {
  const target = findTileMapForLayer(scene, layerId)
  if (!target) return []
  const sprites: SpriteDataMap[] = []
  for (const { tileX, tileY } of iterateOccupiedCoords(target.editor)) {
    for (const ref of getSpritesAt(target.editor, tileX, tileY, layerId)) {
      sprites.push({
        x: tileX,
        y: tileY,
        spriteSetId: ref.spriteSetId,
        spriteId: ref.spriteId,
        ...(ref.animationId ? { animationId: ref.animationId } : {}),
      })
    }
  }
  return sprites
}
