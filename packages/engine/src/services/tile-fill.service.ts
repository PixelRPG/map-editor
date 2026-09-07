import { FillTileCommand } from '../commands/index.ts'
import type { MapEditorComponent } from '../components/map-editor.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { computeFloodFillRegion, type GridCell } from './flood-fill.ts'
import { findSpriteInfoForTileId } from './sprite-info.resolver.ts'
import { snapshotPreviousSprites } from './tile-paint.service.ts'

/**
 * Shared bucket-fill command builder — the single place that turns a
 * click origin into a {@link FillTileCommand}, so the pointer path
 * (`TileEditorSystem`) and the programmatic path (`Engine.fillTileAt`,
 * driven over D-Bus/MCP) build identical commands that flow through the
 * same op-log / undo / collab-sync pipeline. Mirrors the role
 * `tile-paint.service.ts` plays for the single-tile paint tools.
 */

/**
 * Stable identity of a layer's sprite stack at one tile — the fill
 * matches contiguous cells sharing this. Only sprite identity (set +
 * id) matters; z-index / animation are ignored. Empty tile → `''`.
 */
function layerSignature(refs: ReadonlyArray<{ spriteSetId: string; spriteId: number }>): string {
  return refs.map((ref) => `${ref.spriteSetId}#${ref.spriteId}`).join('|')
}

/**
 * The cells a bucket-fill from `(originX, originY)` on `layerId` would
 * repaint with `spriteId`, or `null` when the click would change
 * nothing: the sprite id is unknown, the origin already shows the fill
 * tile, or the region is empty.
 *
 * This is THE fill region — {@link buildTileFillCommand} (the click)
 * and `services/fill-preview.ts` (the hover) both call it, so what the
 * preview outlines and what the click repaints cannot drift apart: a
 * second, similar-looking traversal for the preview would be a bug
 * generator.
 */
export function resolveTileFillRegion(
  editor: MapEditorComponent,
  mapResource: MapResource,
  bounds: { columns: number; rows: number },
  layerId: string,
  originX: number,
  originY: number,
  spriteId: number,
): GridCell[] | null {
  const targetInfo = findSpriteInfoForTileId(mapResource, spriteId)
  if (!targetInfo) return null
  const targetSignature = `${targetInfo.spriteSetId}#${targetInfo.spriteId}`

  const signatureAt = (x: number, y: number): string => layerSignature(snapshotPreviousSprites(editor, layerId, x, y))

  // Every cell in the region shares the origin's signature; if that
  // already equals the fill tile there's nothing to change (and no
  // point pushing a useless undo entry).
  if (signatureAt(originX, originY) === targetSignature) return null

  const region = computeFloodFillRegion({ x: originX, y: originY }, bounds, signatureAt)
  return region.length === 0 ? null : region
}

/**
 * Build a bucket-fill command for the region {@link resolveTileFillRegion}
 * resolves, replacing each cell with `spriteId`. Returns `null` when
 * that region is `null` (nothing would change).
 */
export function buildTileFillCommand(
  editor: MapEditorComponent,
  mapResource: MapResource,
  bounds: { columns: number; rows: number },
  layerId: string,
  originX: number,
  originY: number,
  spriteId: number,
): FillTileCommand | null {
  const region = resolveTileFillRegion(editor, mapResource, bounds, layerId, originX, originY, spriteId)
  if (!region) return null

  const cells = region.map((cell) => ({
    tileX: cell.x,
    tileY: cell.y,
    previousSprites: snapshotPreviousSprites(editor, layerId, cell.x, cell.y),
  }))
  return new FillTileCommand({ layerId, spriteId, cells })
}
