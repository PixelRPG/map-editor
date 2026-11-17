import { FillTileCommand, PaintCellsCommand } from '../commands/index.ts'
import type { MapEditorComponent } from '../components/map-editor.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { TerrainAddress } from '../resource/terrain.ts'
import { terrainFootprint } from '../resource/terrain.ts'
import { computeFloodFillRegion, type GridCell } from './flood-fill.ts'
import { findSpriteInfoForTileId } from './sprite-info.resolver.ts'
import {
  type TerrainPaintIntent,
  buildPaintCellsCommand,
  planTerrainEdit,
  terrainCatalogForMap,
} from './terrain-paint.service.ts'
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
 *
 * A fill that neither covers nor places a terrain member stays
 * `tile.fill` — one sprite id for the whole region, the smallest
 * payload for the commonest case. A fill that touches terrain goes
 * through the planner instead and comes back as `tile.cells`, because
 * the one-cell border around the region has to re-resolve (TERRAIN.md
 * §6.2) and `tile.fill` cannot carry a different tile per cell.
 */
export function buildTileFillCommand(
  editor: MapEditorComponent,
  mapResource: MapResource,
  bounds: { columns: number; rows: number },
  layerId: string,
  originX: number,
  originY: number,
  spriteId: number,
): FillTileCommand | PaintCellsCommand | null {
  const region = resolveTileFillRegion(editor, mapResource, bounds, layerId, originX, originY, spriteId)
  if (!region) return null

  const sprite = findSpriteInfoForTileId(mapResource, spriteId)
  const catalog = terrainCatalogForMap(mapResource)
  if (sprite && catalog.hasTerrains) {
    const intents: TerrainPaintIntent[] = region.map((cell) => ({ kind: 'tile', x: cell.x, y: cell.y, sprite }))
    const plan = planTerrainEdit({ editor, layerId, catalog, bounds, intents })
    if (plan.touchesTerrain) {
      return plan.cells.length === 0
        ? null
        : new PaintCellsCommand({ layerId, label: { verb: 'fill' }, cells: plan.cells })
    }
  }

  const cells = region.map((cell) => ({
    tileX: cell.x,
    tileY: cell.y,
    previousSprites: snapshotPreviousSprites(editor, layerId, cell.x, cell.y),
  }))
  return new FillTileCommand({ layerId, spriteId, cells })
}

/** What a bucket-fill with a terrain armed would cover, and where the brush can actually be put down. */
export interface TerrainFillRegion {
  /** The contiguous same-signature region the click landed in — what the hover outlines. */
  readonly region: GridCell[]
  /** The cells the brush is anchored at: those whose whole footprint fits inside {@link region}. */
  readonly anchors: GridCell[]
}

/**
 * THE terrain-fill region — {@link buildTerrainFillCommand} (the click)
 * and `services/fill-preview.ts` (the hover) both call it, so what the
 * preview outlines and what the click repaints cannot drift apart, as
 * with {@link resolveTileFillRegion} for the tile fill.
 *
 * The region is the same contiguous same-signature patch the tile fill
 * uses, minus its "the origin already shows the fill tile" shortcut:
 * with a terrain there is no single tile to compare a cell against, and
 * a region that already looks right simply plans to zero cells, so the
 * command builder returns `null` on its own.
 *
 * A cell is an **anchor** only when its whole footprint lies inside the
 * region. For a footprint-1 brush that is every cell, so the fill is
 * exact. For a 2×2 patch brush it is what keeps the fill inside the
 * shape the user clicked: anchoring on a cell whose lower-right
 * neighbour sits outside would paint past the region's edge. A region
 * narrower than the brush therefore has no anchors at all — correct
 * for a brush whose sheet has no 1-wide pieces to fill it with — and
 * this returns `null`, so neither the preview nor the click pretends
 * otherwise.
 */
export function resolveTerrainFillRegion(
  editor: MapEditorComponent,
  bounds: { columns: number; rows: number },
  layerId: string,
  originX: number,
  originY: number,
  footprint: 1 | 2,
): TerrainFillRegion | null {
  const signatureAt = (x: number, y: number): string => layerSignature(snapshotPreviousSprites(editor, layerId, x, y))
  const region = computeFloodFillRegion({ x: originX, y: originY }, bounds, signatureAt)
  if (region.length === 0) return null

  if (footprint === 1) return { region, anchors: region }

  const inRegion = new Set(region.map((cell) => `${cell.x},${cell.y}`))
  const anchors = region.filter(
    (cell) =>
      inRegion.has(`${cell.x + 1},${cell.y}`) &&
      inRegion.has(`${cell.x},${cell.y + 1}`) &&
      inRegion.has(`${cell.x + 1},${cell.y + 1}`),
  )
  return anchors.length === 0 ? null : { region, anchors }
}

/**
 * The bucket with a TERRAIN armed: flood the region the click lands in,
 * then lay the brush at every anchor {@link resolveTerrainFillRegion}
 * found — one `tile.cells` command, one undo step, the ring around the
 * region re-resolved like any other terrain edit (TERRAIN.md §6.2).
 *
 * `null` when the brush does not resolve, the region has no anchor, or
 * the result equals what is already there.
 */
export function buildTerrainFillCommand(request: {
  readonly editor: MapEditorComponent
  readonly mapResource: MapResource | null | undefined
  readonly bounds: { columns: number; rows: number }
  readonly layerId: string
  readonly originX: number
  readonly originY: number
  readonly terrain: TerrainAddress
}): PaintCellsCommand | null {
  const { editor, mapResource, bounds, layerId, originX, originY, terrain } = request
  const catalog = terrainCatalogForMap(mapResource)
  const data = catalog.terrainAt(terrain)
  if (!data) return null

  const filled = resolveTerrainFillRegion(editor, bounds, layerId, originX, originY, terrainFootprint(data))
  if (!filled) return null

  const intents: TerrainPaintIntent[] = filled.anchors.map((cell) => ({
    kind: 'terrain',
    x: cell.x,
    y: cell.y,
    terrain,
  }))
  return buildPaintCellsCommand({ editor, layerId, catalog, bounds, intents }, { verb: 'fill', terrain })
}
