/**
 * Pure guard chain shared by every *programmatic* map edit
 * (`Engine.paintTileAt` / `fillTileAt` / `placeObjectAt` — the headless
 * equivalents of a pointer click, driven over D-Bus/MCP).
 *
 * All four entry points used to repeat the same sequence inline —
 * assistant-paused → active scene → resolve layer → layer locked →
 * resolve tilemap → bounds — which meant a guard could silently drift
 * out of one path (the object placement bounds check was added to
 * `placeObjectAt` long after `paintTileAt` had it). One owner, one
 * order, unit-tested here.
 *
 * Excalibur-free by design: callers pass plain lookups, so the chain
 * tests under the node target without a live scene.
 */

import { isTileOutOfBounds } from './tile-geometry.ts'

/** Why an edit was refused. Discriminates the `rejected` branch below. */
export type TileEditRejection =
  | 'assistant-paused'
  | 'no-active-map'
  | 'no-layer'
  | 'layer-locked'
  | 'no-tilemap'
  | 'out-of-bounds'

/** Minimal tile-grid shape — structurally satisfied by Excalibur's `TileMap`. */
export interface TileGrid {
  readonly columns: number
  readonly rows: number
}

/** Inputs shared by every programmatic edit, up to and including the lock check. */
export interface EditLayerQuery {
  /** The user paused the assistant; its mutations are refused. */
  readonly assistantPaused: boolean
  /** Whether a `MapScene` is currently active. */
  readonly hasActiveMap: boolean
  /** Layer explicitly named by the caller, or `null` to use the active layer. */
  readonly requestedLayerId: string | null
  /** Current active layer, used when `requestedLayerId` is `null`. */
  readonly activeLayerId: string | null
  readonly isLayerLocked: (layerId: string) => boolean
}

export type EditLayerResolution =
  | { readonly type: 'resolved'; readonly layerId: string }
  | { readonly type: 'rejected'; readonly reason: TileEditRejection }

/** Adds the tile-grid half of the chain: tilemap lookup + bounds. */
export interface TileEditTargetQuery<TTileMap extends TileGrid, TEditor> extends EditLayerQuery {
  readonly tileX: number
  readonly tileY: number
  readonly findTileMap: (layerId: string) => { tileMap: TTileMap; editor: TEditor } | null
}

export type TileEditTarget<TTileMap extends TileGrid, TEditor> =
  | {
      readonly type: 'resolved'
      readonly layerId: string
      readonly tileMap: TTileMap
      readonly editor: TEditor
    }
  | { readonly type: 'rejected'; readonly reason: TileEditRejection }

/**
 * Resolve the layer a programmatic edit should target, or the reason it
 * cannot proceed. Order is load-bearing: pause beats everything (the
 * human is in control), then the scene must exist before a layer can be
 * named, and the lock check comes last so an unknown layer id reports
 * `no-layer` rather than "editable by default".
 */
export function resolveEditLayer(query: EditLayerQuery): EditLayerResolution {
  if (query.assistantPaused) return { type: 'rejected', reason: 'assistant-paused' }
  if (!query.hasActiveMap) return { type: 'rejected', reason: 'no-active-map' }
  const layerId = query.requestedLayerId ?? query.activeLayerId
  if (!layerId) return { type: 'rejected', reason: 'no-layer' }
  if (query.isLayerLocked(layerId)) return { type: 'rejected', reason: 'layer-locked' }
  return { type: 'resolved', layerId }
}

/**
 * Full chain for a tile-level edit: {@link resolveEditLayer} plus the
 * per-tier tilemap lookup and the bounds check against that tilemap.
 */
export function resolveTileEditTarget<TTileMap extends TileGrid, TEditor>(
  query: TileEditTargetQuery<TTileMap, TEditor>,
): TileEditTarget<TTileMap, TEditor> {
  const layer = resolveEditLayer(query)
  if (layer.type === 'rejected') return layer
  const found = query.findTileMap(layer.layerId)
  if (!found) return { type: 'rejected', reason: 'no-tilemap' }
  if (isTileOutOfBounds(query.tileX, query.tileY, found.tileMap.columns, found.tileMap.rows)) {
    return { type: 'rejected', reason: 'out-of-bounds' }
  }
  return { type: 'resolved', layerId: layer.layerId, tileMap: found.tileMap, editor: found.editor }
}
