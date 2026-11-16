import { PaintCellsCommand } from '../commands/paint-tile.command.ts'
import type { EraseTileCommand, PaintTileCommand } from '../commands/index.ts'
import type { MapEditorComponent } from '../components/index.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { TerrainBounds } from '../resource/terrain.ts'
import { type TileStamp, isSingleTileStamp, stampCellsAt } from '../resource/tile-stamp.ts'
import { findSpriteInfoForTileId } from './sprite-info.resolver.ts'
import {
  type TerrainCatalog,
  type TerrainPaintIntent,
  planTerrainEdit,
  terrainCatalogForMap,
} from './terrain-paint.service.ts'
import { buildTilePaintCommand } from './tile-paint.service.ts'

/**
 * Shared stamp-brush command builder — the single place that turns a
 * click origin plus the armed {@link TileStamp} into a command, so the
 * pointer path (`TileEditorSystem`) and the programmatic path
 * (`Engine.paintTile` without an explicit sprite id) build identical
 * commands that flow through the same op-log / undo / collab-sync
 * pipeline. Mirrors the role `tile-fill.service.ts` plays for the
 * bucket.
 *
 * It also owns the ONE "stamp or paint?" decision in the codebase: a
 * 1×1 stamp over a block of ordinary tiles delegates to
 * {@link buildTilePaintCommand}, so the common single-tile stroke keeps
 * the exact command, undo label and wire op it has always had, and
 * widening the brush changes nothing for it. A stamp that lands on or
 * removes a terrain member instead goes through the planner, so the
 * ring around it re-resolves — stamping a flower into a path closes the
 * path around it rather than leaving two open stubs (TERRAIN.md §6.2).
 */

/** What a stamp stroke needs to know. One object because the pieces travel together. */
export interface TileStampRequest {
  readonly editor: MapEditorComponent
  readonly layerId: string
  /** Hovered tile — the stamp's TOP-LEFT cell lands here. */
  readonly originX: number
  readonly originY: number
  readonly stamp: TileStamp
  /** Map extent, so a stamp at the edge writes only the part that fits. */
  readonly bounds?: TerrainBounds
  /**
   * The map the stamp lands on — needed to turn the stamp's GLOBAL tile
   * ids into the `(spriteSetId, spriteId)` refs a cell holds, and to
   * find out which of those refs belong to a terrain. Without it a
   * stamp still builds, as plain tiles with no terrain re-resolution.
   */
  readonly mapResource?: MapResource | null
}

/**
 * The command a stamp stroke executes, or `null` when it would write
 * nothing: an empty stamp, a block entirely off the map, or a stamp
 * that changes no cell.
 *
 * One command for the whole block — one undo step, one collab op
 * (REDESIGN §8).
 */
export function buildTileStampCommand(
  request: TileStampRequest,
): PaintCellsCommand | PaintTileCommand | EraseTileCommand | null {
  const { editor, layerId, originX, originY, stamp, bounds, mapResource } = request
  const cells = stampCellsAt(stamp, { x: originX, y: originY }, bounds)
  if (cells.length === 0) return null

  const catalog: TerrainCatalog = terrainCatalogForMap(mapResource)
  const intents: TerrainPaintIntent[] = []
  for (const cell of cells) {
    const sprite = mapResource ? findSpriteInfoForTileId(mapResource, cell.spriteId) : null
    if (!sprite) {
      // No map (or an id no set claims): nothing to resolve a ref from,
      // so the stamp cannot be planned. Fall back to the single-tile
      // path below rather than writing a ref the renderer cannot find.
      return isSingleTileStamp(stamp) ? singleCellCommand(request, cells[0]) : null
    }
    intents.push({ kind: 'tile', x: cell.tileX, y: cell.tileY, sprite })
  }

  const plan = planTerrainEdit({ editor, layerId, catalog, bounds, intents })
  // A 1×1 stamp that neither lands on nor removes a terrain member is
  // the ordinary pencil stroke: keep its command, its undo label and
  // its wire op.
  if (!plan.touchesTerrain && isSingleTileStamp(stamp)) return singleCellCommand(request, cells[0])
  if (plan.cells.length === 0) return null
  return new PaintCellsCommand({ layerId, label: { verb: 'stamp' }, cells: plan.cells })
}

/** The single-tile stroke, unchanged: `tile.paint` (or `tile.erase` for a hole). */
function singleCellCommand(
  request: TileStampRequest,
  cell: { tileX: number; tileY: number; spriteId: number } | undefined,
): PaintTileCommand | EraseTileCommand | null {
  if (!cell) return null
  return buildTilePaintCommand(request.editor, request.layerId, cell.tileX, cell.tileY, cell.spriteId)
}
