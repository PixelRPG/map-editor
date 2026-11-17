import { Actor, Color, type TileMap, Vector, vec } from 'excalibur'
import { EditorViewModeComponent, MapEditorComponent, zFor } from '../components/index.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { type TileCollisionData, type TileCollisionRef, tileCollisionOf } from '../resource/tile-collision.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { SessionState } from '../utils/session-state.ts'
import { cameraView } from './fill-preview.ts'
import { iterateOccupiedCoords } from './map-editor-shadow.service.ts'
import { resolveMapBounds } from './tile-edit-target.ts'
import { WALL_HATCH_ALPHA, WALL_HATCH_COLOR, WALL_HATCH_LINE_WIDTH, wallHatchSegments } from './wall-hatch.ts'
import { type WallHatchCell, WallHatchGraphic } from './wall-hatch-graphic.ts'

/**
 * "Show walls" on the map — one actor per scene, hatching every cell
 * the hero cannot walk through.
 *
 * What a cell blocks is the union of every plane stacked at it, because
 * that is what the hero meets: one blocking sprite on any plane blocks
 * the cell, so drawing each plane separately would double the alpha
 * wherever two of them block. The union is the same pure
 * {@link tileCollisionOf} fold the collider build uses, reached through
 * {@link MapResource.collisionAt} so the picture cannot disagree with
 * the physics.
 *
 * Only *occupied* cells are considered. An empty cell has no sprite and
 * therefore nothing to block with, so a map's hatch costs its painted
 * tiles rather than its full grid.
 *
 * The rebuild is keyed on a cheap stamp — every plane shadow's
 * `revision` plus the map's `collisionRevision` — so the refresh can be
 * called from every path that might have changed the answer (a paint,
 * an undo, a peer's op, a tileset collision edit) and is free when
 * nothing did. While the flag is off nothing is computed at all.
 */

interface WallOverlayCache {
  readonly mapResource: MapResource
  readonly stamp: string
  readonly graphic: WallHatchGraphic
}

const caches = new WeakMap<Actor, WallOverlayCache>()
const actors = new WeakMap<MapScene, Actor>()

/**
 * Construct the overlay actor. Top-left anchored at the map's origin.
 * Z-pinned above every tilemap plane but BELOW the hover overlays
 * (`+ 50`): the hatching is standing information, the "what would this
 * click do" ghosts are the thing the user is aiming with.
 */
export function createWallOverlayActor(): Actor {
  const actor = new Actor({ name: 'wall-hatch-overlay', anchor: vec(0, 0) })
  actor.z = zFor('overlay') + 40
  actor.graphics.anchor = vec(0, 0)
  actor.graphics.isVisible = false
  return actor
}

/**
 * The scene's wall overlay, added to the scene on first use.
 *
 * Lazy rather than created with the scene: a map opened with the flag
 * off never builds one.
 */
export function ensureWallOverlay(scene: MapScene): Actor {
  const existing = actors.get(scene)
  if (existing) return existing
  const actor = createWallOverlayActor()
  actors.set(scene, actor)
  scene.add(actor)
  return actor
}

/** Reconcile the scene's wall overlay with its current state. Idempotent. */
export function refreshWallOverlayFor(scene: MapScene): void {
  const wanted = SessionState.get(scene, EditorViewModeComponent)?.showWalls ?? false
  // Don't materialise an actor just to hide it — a scene that never
  // turns the flag on never gets one.
  if (!wanted && !actors.has(scene)) return
  refreshWallOverlay(ensureWallOverlay(scene), scene)
}

/**
 * Reconcile `actor` with the scene's view flags and map state. Hides
 * the overlay when `showWalls` is off, when the map isn't loaded, or
 * when nothing on it blocks.
 */
export function refreshWallOverlay(actor: Actor, scene: MapScene): void {
  const flags = SessionState.get(scene, EditorViewModeComponent)
  const mapResource = scene.mapResource
  if (!flags?.showWalls || !mapResource) {
    actor.graphics.isVisible = false
    return
  }

  const planes = collectPlanes(mapResource)
  if (!planes) {
    actor.graphics.isVisible = false
    return
  }

  const { tileMap, editors } = planes
  const bounds = resolveMapBounds(mapResource.mapData, tileMap)
  const stamp = [
    mapResource.collisionRevision,
    bounds.columns,
    bounds.rows,
    tileMap.tileWidth,
    tileMap.tileHeight,
    ...editors.map((editor) => editor.revision),
  ].join(':')

  let cache = caches.get(actor)
  if (!cache || cache.mapResource !== mapResource || cache.stamp !== stamp) {
    cache = {
      mapResource,
      stamp,
      graphic: buildGraphic(mapResource, tileMap, editors, bounds, scene),
    }
    caches.set(actor, cache)
    actor.graphics.use(cache.graphic)
  }

  actor.pos = new Vector(tileMap.pos.x, tileMap.pos.y)
  cache.graphic.worldOrigin = actor.pos
  actor.graphics.isVisible = cache.graphic.lineCount > 0
}

/** How many hatch lines the overlay currently holds — for tests. */
export function wallOverlayLineCount(actor: Actor): number {
  return caches.get(actor)?.graphic.lineCount ?? 0
}

/**
 * One plane's tilemap for geometry plus every plane's shadow for
 * content, or `null` before the map's tilemaps exist. Any plane serves
 * as the geometry reference — all of them are congruent, only the
 * shadows differ.
 */
function collectPlanes(mapResource: MapResource): { tileMap: TileMap; editors: MapEditorComponent[] } | null {
  let tileMap: TileMap | null = null
  const editors: MapEditorComponent[] = []
  for (const candidate of mapResource.tileMaps()) {
    tileMap ??= candidate
    const editor = candidate.get(MapEditorComponent)
    if (editor) editors.push(editor)
  }
  if (!tileMap || editors.length === 0) return null
  return { tileMap, editors }
}

function buildGraphic(
  mapResource: MapResource,
  tileMap: TileMap,
  editors: readonly MapEditorComponent[],
  bounds: { columns: number; rows: number },
  scene: MapScene,
): WallHatchGraphic {
  const { tileWidth, tileHeight } = tileMap
  const color = Color.fromHex(WALL_HATCH_COLOR)
  color.a = WALL_HATCH_ALPHA

  const cells: WallHatchCell[] = []
  const memo = new Map<string, TileCollisionRef>()
  for (const { tileX, tileY } of occupiedCells(editors, bounds)) {
    const collision = unionCollision(mapResource, editors, tileX, tileY, memo)
    if (!collision.solid) continue
    const segments = wallHatchSegments(collision, tileWidth, tileHeight, {
      x: tileX * tileWidth,
      y: tileY * tileHeight,
      width: tileWidth,
      height: tileHeight,
    })
    if (segments.length > 0) cells.push({ x: tileX, y: tileY, segments })
  }

  return new WallHatchGraphic({
    cells,
    columns: bounds.columns,
    rows: bounds.rows,
    tileWidth,
    tileHeight,
    color,
    lineWidth: WALL_HATCH_LINE_WIDTH,
    view: () => cameraView(scene),
  })
}

/**
 * Every cell any plane has painted, once. Out-of-bounds shadow entries
 * are skipped — a map shrunk after painting keeps the old refs in the
 * shadow until the next save, and hatching them would draw outside the
 * grid.
 */
function* occupiedCells(
  editors: readonly MapEditorComponent[],
  bounds: { columns: number; rows: number },
): IterableIterator<{ tileX: number; tileY: number }> {
  const seen = new Set<number>()
  for (const editor of editors) {
    for (const coords of iterateOccupiedCoords(editor)) {
      const { tileX, tileY } = coords
      if (tileX < 0 || tileY < 0 || tileX >= bounds.columns || tileY >= bounds.rows) continue
      const key = tileY * bounds.columns + tileX
      if (seen.has(key)) continue
      seen.add(key)
      yield coords
    }
  }
}

/** Fold every plane's contribution at one cell into a single collision answer. */
function unionCollision(
  mapResource: MapResource,
  editors: readonly MapEditorComponent[],
  tileX: number,
  tileY: number,
  memo: Map<string, TileCollisionRef>,
): TileCollisionData {
  if (editors.length === 1) return mapResource.collisionAt(editors[0], tileX, tileY, memo)
  return tileCollisionOf(editors.map((editor) => mapResource.collisionAt(editor, tileX, tileY, memo)))
}
