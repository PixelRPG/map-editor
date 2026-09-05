import { TileMap } from 'excalibur'
import { EraseTileCommand, PaintTileCommand, type PaintTilePayload } from '../commands/index.ts'
import { MapEditorComponent, TileMapPlaneComponent } from '../components/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { DEFAULT_LAYER_PLANE } from '../types/data/LayerData.ts'
import { getSpritesAt } from './map-editor-shadow.service.ts'

/**
 * Shared tile-paint primitives — the single place that snapshots the
 * previous sprites and chooses Paint vs Erase, so the pointer path
 * (`TileEditorSystem`) and the programmatic path (`Engine.paintTileAt`,
 * driven over D-Bus/MCP) build identical commands that flow through the
 * same op-log / undo / collab-sync pipeline.
 */

/** Snapshot the sprites currently on `(tileX, tileY)` of `layerId` (for command revert). */
export function snapshotPreviousSprites(
  editor: MapEditorComponent,
  layerId: string,
  tileX: number,
  tileY: number,
): PaintTilePayload['previousSprites'] {
  return getSpritesAt(editor, tileX, tileY, layerId).map((ref) => ({
    spriteSetId: ref.spriteSetId,
    spriteId: ref.spriteId,
    animationId: ref.animationId,
  }))
}

/** Build a Paint (spriteId > 0) or Erase (spriteId null/0) command from precomputed previous sprites. */
export function makeTilePaintCommand(
  layerId: string,
  tileX: number,
  tileY: number,
  spriteId: number | null,
  previousSprites: PaintTilePayload['previousSprites'],
): PaintTileCommand | EraseTileCommand {
  if (spriteId && spriteId > 0) {
    return new PaintTileCommand({ layerId, tileX, tileY, spriteId, previousSprites })
  }
  return new EraseTileCommand({ layerId, tileX, tileY, previousSprites })
}

/** Snapshot + build in one step — convenience for the programmatic paint path. */
export function buildTilePaintCommand(
  editor: MapEditorComponent,
  layerId: string,
  tileX: number,
  tileY: number,
  spriteId: number | null,
): PaintTileCommand | EraseTileCommand {
  return makeTilePaintCommand(layerId, tileX, tileY, spriteId, snapshotPreviousSprites(editor, layerId, tileX, tileY))
}

/**
 * Resolve the per-plane `TileMap` + its `MapEditorComponent` for a layer
 * (fresh entity scan — fine for occasional programmatic paint; the
 * pointer path caches its own lookup). `null` if not found.
 */
export function findTileMapForLayer(
  scene: MapScene,
  layerId: string,
): { tileMap: TileMap; editor: MapEditorComponent } | null {
  const layer = scene.mapResource?.mapData?.layers.find((l) => l.id === layerId)
  if (!layer) return null // reject unknown layer ids (don't silently fall back to the default plane)
  const plane = layer.plane ?? DEFAULT_LAYER_PLANE
  for (const entity of scene.world.entityManager.entities) {
    if (!(entity instanceof TileMap)) continue
    if (entity.get(TileMapPlaneComponent)?.plane !== plane) continue
    const editor = entity.get(MapEditorComponent)
    if (editor) return { tileMap: entity, editor }
  }
  return null
}
