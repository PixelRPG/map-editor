import { Actor, Color, type Scene, type TileMap, Vector, vec } from 'excalibur'
import {
  ActiveLayerComponent,
  ActiveTileComponent,
  ActiveToolComponent,
  type MapEditorComponent,
  zFor,
} from '../components/index.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { SessionState } from '../utils/session-state.ts'
import type { GridCell } from './flood-fill.ts'
import { RegionGraphic, type RegionView } from './region-graphic.ts'
import { resolveMapBounds } from './tile-edit-target.ts'
import { resolveTileFillRegion } from './tile-fill.service.ts'
import { findTileMapForLayer } from './tile-paint.service.ts'

/**
 * Fill-tool hover preview — the contiguous region a bucket-fill click
 * would repaint, tinted and outlined on the active map. The fill is
 * the one tool whose effect is not bounded by the cursor, so without
 * this every click is a leap: the user cannot see where the region
 * stops.
 *
 * The region comes from {@link resolveTileFillRegion} — the SAME
 * function the click runs — including its "the origin already shows
 * the fill tile, so nothing happens" rule: when the click would be a
 * no-op, the preview shows nothing.
 *
 * Cost: the flood fill on kokiri-forest's whole-map region is 17 ms
 * under GJS, far too much for the raw pointer-move stream. Two facts
 * keep it off the hot path. A flood-fill region is an equivalence
 * class — every cell in it yields the same region — so a hover that
 * lands inside the last computed region is an O(1) membership hit.
 * And the shadow's `revision` counter tells the cache when the map
 * changed underneath it, so a click, undo or remote op invalidates
 * without the preview subscribing to every mutation path.
 *
 * Owner contract mirrors `pencil-preview.ts`: the caller holds the
 * actor + hover and calls {@link refreshFillPreview}; every show/hide
 * precondition is resolved here.
 */

/** Hover context the caller hands to {@link refreshFillPreview}. */
export interface FillPreviewHover {
  tileMap: TileMap
  coords: { x: number; y: number }
}

/** Everything a fill click reads, resolved once per refresh; `null` when the click would be refused. */
interface FillTarget {
  readonly mapResource: MapResource
  readonly tileMap: TileMap
  readonly editor: MapEditorComponent
  readonly layerId: string
  readonly spriteId: number
  readonly bounds: { columns: number; rows: number }
}

interface FillPreviewCache {
  readonly editor: MapEditorComponent
  readonly revision: number
  readonly layerId: string
  readonly spriteId: number
  /** Region membership keyed `y * columns + x` — the O(1) "same region?" test. */
  readonly members: Set<number>
  readonly graphic: RegionGraphic
}

const caches = new WeakMap<Actor, FillPreviewCache>()

/**
 * Construct the preview actor. Top-left anchored; its `pos` is the
 * region's bounding-box corner, not the hovered tile. Z-pinned above
 * every tilemap plane, level with the other hover overlays.
 */
export function createFillPreviewActor(): Actor {
  const actor = new Actor({ name: 'fill-region-preview', anchor: vec(0, 0) })
  actor.z = zFor('overlay') + 50
  actor.graphics.anchor = vec(0, 0)
  actor.graphics.visible = false
  return actor
}

/**
 * Reconcile the preview actor with the scene's current editor state.
 * Pass `hover = null` to hide (pointer off the map). Other hide
 * conditions resolved internally, each one a reason the click itself
 * would do nothing:
 *
 * - Active tool isn't `'fill'`
 * - No tile armed (`ActiveTileComponent`)
 * - The active layer is locked, or no longer exists
 * - The origin already shows the fill tile (`resolveTileFillRegion`
 *   returns `null`)
 *
 * Idempotent — safe on every pointer move and on every session-state
 * or map mutation.
 */
export function refreshFillPreview(actor: Actor, scene: Scene, hover: FillPreviewHover | null): void {
  const target = hover ? resolveFillTarget(scene) : null
  if (!target || !hover) {
    actor.graphics.visible = false
    return
  }

  const { x, y } = hover.coords
  let cache = caches.get(actor)
  if (!isCacheValid(cache, target) || !cache.members.has(y * target.bounds.columns + x)) {
    const region = resolveTileFillRegion(
      target.editor,
      target.mapResource,
      target.bounds,
      target.layerId,
      x,
      y,
      target.spriteId,
    )
    if (!region) {
      actor.graphics.visible = false
      return
    }
    cache = buildCache(target, region, scene)
    caches.set(actor, cache)
    actor.graphics.use(cache.graphic)
    actor.pos = new Vector(
      target.tileMap.pos.x + cache.graphic.cellBounds.x * target.tileMap.tileWidth,
      target.tileMap.pos.y + cache.graphic.cellBounds.y * target.tileMap.tileHeight,
    )
    cache.graphic.worldOrigin = actor.pos
  }
  actor.graphics.visible = true
}

/** The region currently previewed on `actor`, or `null` while hidden — for callers that compare it with a click. */
export function previewedFillRegion(actor: Actor): readonly GridCell[] | null {
  return actor.graphics.visible ? (caches.get(actor)?.graphic.cells ?? null) : null
}

function isCacheValid(cache: FillPreviewCache | undefined, target: FillTarget): cache is FillPreviewCache {
  return (
    cache !== undefined &&
    cache.editor === target.editor &&
    cache.revision === target.editor.revision &&
    cache.layerId === target.layerId &&
    cache.spriteId === target.spriteId
  )
}

function buildCache(target: FillTarget, region: GridCell[], scene: Scene): FillPreviewCache {
  const members = new Set<number>()
  for (const cell of region) members.add(cell.y * target.bounds.columns + cell.x)
  const tint = Color.fromHex(EDITOR_CONSTANTS.FILL_PREVIEW_COLOR)
  tint.a = EDITOR_CONSTANTS.FILL_PREVIEW_TINT_ALPHA
  return {
    editor: target.editor,
    revision: target.editor.revision,
    layerId: target.layerId,
    spriteId: target.spriteId,
    members,
    graphic: new RegionGraphic({
      cells: region,
      tileWidth: target.tileMap.tileWidth,
      tileHeight: target.tileMap.tileHeight,
      tintColor: tint,
      strokeColor: Color.fromHex(EDITOR_CONSTANTS.FILL_PREVIEW_COLOR),
      lineWidth: EDITOR_CONSTANTS.HOVER_BORDER_LINE_WIDTH,
      view: () => cameraView(scene),
    }),
  }
}

/**
 * Resolve what a fill click would read, or `null` when any
 * precondition is missing — the same chain `TileEditorSystem.applyClick`
 * walks (tool, armed tile, layer, lock, plane tilemap).
 *
 * The plane tilemap is looked up from the ACTIVE layer rather than
 * taken from the hover: the hover's tilemap was resolved when the
 * pointer last moved, and the user may have switched layers since.
 * Every plane's tilemap is congruent, so only the shadow differs.
 */
function resolveFillTarget(scene: Scene): FillTarget | null {
  const tool = SessionState.get(scene, ActiveToolComponent)?.tool
  if (tool !== 'fill') return null

  const spriteId = SessionState.get(scene, ActiveTileComponent)?.spriteId
  if (spriteId === undefined) return null

  const mapScene = scene as MapScene
  const mapResource = mapScene.mapResource
  if (!mapResource) return null

  const layerId = SessionState.get(scene, ActiveLayerComponent)?.layerId ?? mapResource.getFirstLayerId?.()
  if (!layerId) return null
  const layer = mapResource.mapData?.layers.find((l) => l.id === layerId)
  if (layer?.locked) return null

  const found = findTileMapForLayer(mapScene, layerId)
  if (!found) return null

  return {
    mapResource,
    tileMap: found.tileMap,
    editor: found.editor,
    layerId,
    spriteId,
    bounds: resolveMapBounds(mapResource.mapData, found.tileMap),
  }
}

/** The camera's world-space viewport + zoom, or `null` off-engine (headless tests draw nothing anyway). */
export function cameraView(scene: Scene): RegionView | null {
  const screen = scene.engine?.screen
  if (!screen) return null
  return { bounds: screen.getWorldBounds(), zoom: scene.camera?.zoom || 1 }
}
