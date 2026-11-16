import { StampTilesCommand } from '../commands/index.ts'
import type { MapEditorComponent } from '../components/index.ts'
import { type TileStamp, isSingleTileStamp, stampCellsAt } from '../resource/tile-stamp.ts'
import { buildTilePaintCommand, snapshotPreviousSprites } from './tile-paint.service.ts'
import type { EraseTileCommand, PaintTileCommand } from '../commands/index.ts'

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
 * 1×1 stamp delegates to {@link buildTilePaintCommand}, so the common
 * single-tile stroke keeps the exact command, undo label and wire op it
 * has always had, and widening the brush changes nothing for it.
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
  readonly bounds?: { readonly columns: number; readonly rows: number }
}

/**
 * The command a stamp stroke executes, or `null` when it would write
 * nothing: an empty stamp, or a block entirely off the map.
 *
 * One command for the whole block — one undo step, one collab op
 * (REDESIGN §8).
 */
export function buildTileStampCommand(
  request: TileStampRequest,
): StampTilesCommand | PaintTileCommand | EraseTileCommand | null {
  const { editor, layerId, originX, originY, stamp, bounds } = request
  const cells = stampCellsAt(stamp, { x: originX, y: originY }, bounds)
  if (cells.length === 0) return null

  if (isSingleTileStamp(stamp)) {
    const [cell] = cells
    if (!cell) return null
    return buildTilePaintCommand(editor, layerId, cell.tileX, cell.tileY, cell.spriteId)
  }

  return new StampTilesCommand({
    layerId,
    cells: cells.map((cell) => ({
      tileX: cell.tileX,
      tileY: cell.tileY,
      spriteId: cell.spriteId,
      previousSprites: snapshotPreviousSprites(editor, layerId, cell.tileX, cell.tileY),
    })),
  })
}
