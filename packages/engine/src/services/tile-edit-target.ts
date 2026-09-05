/**
 * Pure guard chain shared by every *mutating* map edit — the four
 * programmatic entry points (`Engine.paintTileAt` / `fillTileAt` /
 * `placeObjectAt` / `removeObject`, the headless equivalents of a
 * pointer click, driven over D-Bus/MCP).
 *
 * All four used to repeat the same sequence inline —
 * assistant-paused → active scene → resolve layer → layer locked →
 * resolve tilemap → bounds — which meant a guard could silently drift
 * out of one path. Two did: the object placement bounds check was
 * added to `placeObjectAt` long after `paintTileAt` had it, and
 * `removeObject` never checked the layer lock at all, so a padlocked
 * layer protected its tiles but not its objects (and the deletion rode
 * the op-log to peers who had set that same padlock).
 *
 * The fix for the CLASS, not just the case: every gate a caller skips
 * is now a NAMED argument ({@link AssistantPauseGate}) rather than an
 * omission — a gate you must opt out of by name cannot be forgotten by
 * accident, and `engine/edit-operations.spec.ts` enumerates
 * `EditOperations`' public methods so a fifth mutating entry point
 * fails the suite until it declares its gates here.
 *
 * The LAYER LOCK deliberately has no opt-out: it protects the *layer*,
 * not the caller, so no entry point may skip it.
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

/**
 * How one entry point treats the assistant-pause gate — the gate that
 * refuses a mutation while the human has the AI collaborator paused.
 *
 * `'skip'` is an opt-OUT that has to be written down at the call site
 * (with its reason in the method's JSDoc), never an omitted field.
 * `removeObject` is the single skipper today: it is the ONLY remove
 * path and the human's Props "Remove" button routes through it, so an
 * engine-level gate would silently disable the user's own button while
 * the assistant is paused. The assistant's access is gated at the
 * maker's Control/D-Bus boundary instead, where the caller is known.
 */
export type AssistantPauseGate = { readonly mode: 'enforce'; readonly paused: boolean } | { readonly mode: 'skip' }

/** Inputs shared by every mutating edit, up to and including the lock check. */
export interface EditLayerQuery {
  /** Assistant-pause gate — `{ mode: 'skip' }` opts out, deliberately. */
  readonly assistantPause: AssistantPauseGate
  /** Whether a `MapScene` is currently active. */
  readonly hasActiveMap: boolean
  /**
   * Layer explicitly named by the caller, or `null` to use the active
   * layer. Entry points whose layer is DICTATED by the thing they
   * mutate (`removeObject` — the placement's own `layerId`) pass it
   * here with a `null` active layer, so the lock they check is the
   * one that owns the object.
   */
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
  /**
   * The map's PERSISTED tile extent (`MapData.columns/rows`) — the one
   * bounds source every edit path checks against. `null` only when the
   * scene carries no parsed map data, in which case the resolved
   * tilemap's derived dimensions stand in. See
   * {@link isTileOutsideMap}.
   */
  readonly mapBounds: TileGrid | null
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
 * Resolve the layer a mutating edit should target, or the reason it
 * cannot proceed. Order is load-bearing: pause beats everything (the
 * human is in control), then the scene must exist before a layer can be
 * named, and the lock check comes last so an unknown layer id reports
 * `no-layer` rather than "editable by default".
 */
export function resolveEditLayer(query: EditLayerQuery): EditLayerResolution {
  if (query.assistantPause.mode === 'enforce' && query.assistantPause.paused) {
    return { type: 'rejected', reason: 'assistant-paused' }
  }
  if (!query.hasActiveMap) return { type: 'rejected', reason: 'no-active-map' }
  const layerId = query.requestedLayerId ?? query.activeLayerId
  if (!layerId) return { type: 'rejected', reason: 'no-layer' }
  if (query.isLayerLocked(layerId)) return { type: 'rejected', reason: 'layer-locked' }
  return { type: 'resolved', layerId }
}

/**
 * Full chain for a tile-level edit: {@link resolveEditLayer} plus the
 * per-tier tilemap lookup and the bounds check against
 * {@link TileEditTargetQuery.mapBounds}.
 */
export function resolveTileEditTarget<TTileMap extends TileGrid, TEditor>(
  query: TileEditTargetQuery<TTileMap, TEditor>,
): TileEditTarget<TTileMap, TEditor> {
  const layer = resolveEditLayer(query)
  if (layer.type === 'rejected') return layer
  const found = query.findTileMap(layer.layerId)
  if (!found) return { type: 'rejected', reason: 'no-tilemap' }
  if (isTileOutsideMap(resolveMapBounds(query.mapBounds, found.tileMap), query.tileX, query.tileY)) {
    return { type: 'rejected', reason: 'out-of-bounds' }
  }
  return { type: 'resolved', layerId: layer.layerId, tileMap: found.tileMap, editor: found.editor }
}

/**
 * THE bounds verdict for every editor edit path — pointer and
 * programmatic alike.
 *
 * `bounds` must be the map's PERSISTED extent (`MapData.columns/rows`).
 * A scene's `TileMap`s are DERIVED from exactly those two fields
 * (`resource/tilemap-builder.ts` → `buildTierTileMaps` copies them
 * verbatim into every tier), so tilemap dimensions are a mirror, never
 * a second source of truth. Checking against the mirror is how the two
 * editor paths came to disagree: `TileEditorSystem.applyObjectStamp`
 * bounded against the tilemap while `EditOperations.placeObject`
 * bounded against `mapData`, and they only agreed by coincidence.
 * `bounds-derivation.spec.ts` fails if the derivation ever breaks.
 *
 * A `null` bounds means "no parsed map data" and is treated as
 * unbounded — the pre-existing behaviour of the programmatic object
 * path, kept so a headless caller without map data is not silently
 * refused.
 */
export function isTileOutsideMap(bounds: TileGrid | null | undefined, tileX: number, tileY: number): boolean {
  if (!bounds) return false
  return isTileOutOfBounds(tileX, tileY, bounds.columns, bounds.rows)
}

/**
 * Pick the extent to work against: the persisted `MapData` when the
 * scene has one, the derived `TileMap` only as a fallback for a scene
 * with no parsed map data.
 *
 * One expression so the four bounds readers — the pointer hit test, the
 * programmatic tile target, and BOTH flood-fill region builders — cannot
 * drift apart the way the two object-stamp paths did. Use it wherever a
 * non-null extent is required; use {@link isTileOutsideMap} where a
 * verdict is what you want.
 */
export function resolveMapBounds(mapData: TileGrid | null | undefined, derived: TileGrid): TileGrid {
  return mapData ?? derived
}
