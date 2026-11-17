import { Actor, Color, GraphicsGroup, type Scene, type Sprite, type TileMap, Vector, vec } from 'excalibur'
import {
  ActiveLayerComponent,
  ActiveTerrainComponent,
  ActiveTileComponent,
  ActiveToolComponent,
  zFor,
} from '../components/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { TerrainAddress } from '../resource/terrain.ts'
import { terrainFootprintCells } from '../resource/terrain.ts'
import { stampCellsAt } from '../resource/tile-stamp.ts'
import { DEFAULT_LAYER_PLANE, type LayerPlane } from '../types/data/LayerData.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { PLANE_TINT } from '../utils/plane-colour.ts'
import { SessionState } from '../utils/session-state.ts'
import { findSpriteInfoForTileId } from './sprite-info.resolver.ts'
import { planTerrainEdit, terrainCatalogForMap } from './terrain-paint.service.ts'
import { findTileMapForLayer, snapshotPreviousSprites } from './tile-paint.service.ts'

/**
 * Pencil-tool hover preview — a half-transparent ghost of the armed
 * brush that follows the pointer on the active tilemap. The brush is a
 * {@link TileStamp}, so the ghost covers the whole block, not just the
 * hovered cell: with a multi-tile stamp the hovered tile alone would
 * not say where the other tiles land. Renders as a regular scene
 * `Actor` rather than a tile graphic, so paint / erase rebuilds don't
 * disturb it and the editor's `MapEditorComponent` shadow state stays
 * free of UI-only ephemera.
 *
 * With a TERRAIN armed the ghost covers the brush's footprint — one
 * cell, or 2×2 for a patch terrain — showing the sprites the planner
 * resolves for exactly this spot, so a pond ghosted over grass already
 * has its shore the right way round (TERRAIN.md §6.2). The ring the
 * stroke re-resolves is deliberately NOT ghosted: the footprint is
 * what the click puts down, and washing the neighbours too would make
 * the brush look bigger than it is.
 *
 * Owner contract: caller holds the actor + the current hover state,
 * passes both to {@link refreshPencilPreview}. The helper resolves
 * preconditions (tool, armed brush, layer lock, sprite resolution)
 * against the scene's session state and either shows or hides the
 * actor accordingly. Callers don't reproduce that branching.
 */

/** Hover context the caller hands to {@link refreshPencilPreview}. */
export interface PencilPreviewHover {
  tileMap: TileMap
  coords: { x: number; y: number }
}

/**
 * Construct the preview actor. Top-left anchored so `pos` maps
 * directly to a tile's world-space origin. Z-pinned above the
 * highest tilemap plane so the ghost sits on top of every painted
 * tile.
 */
export function createPencilPreviewActor(): Actor {
  const actor = new Actor({
    name: 'tile-paint-preview',
    anchor: vec(0, 0),
  })
  actor.z = zFor('overlay') + 50
  actor.graphics.anchor = vec(0, 0)
  actor.graphics.isVisible = false
  return actor
}

/**
 * Reconcile the preview actor with the scene's current editor state.
 * Pass `hover = null` to hide (pointer off the map). All other hide
 * conditions are resolved internally:
 *
 * - Active tool isn't `'pencil'` (eraser / select / etc. suppress)
 * - Nothing armed — neither a tile nor a terrain
 * - Active layer is locked (paint would no-op)
 * - Sprite cannot be resolved on the active map
 *
 * Idempotent — safe to call on every pointer move and on every
 * `ActiveTool` / `ActiveTile` / `ActiveTerrain` / `ActiveLayer`
 * mutation.
 */
export function refreshPencilPreview(actor: Actor, scene: Scene, hover: PencilPreviewHover | null): void {
  const preview = resolvePreviewBlock(scene, hover)
  if (!preview || !hover) {
    actor.graphics.isVisible = false
    return
  }
  // `useAnchor: false` puts the group's top-left at the actor position,
  // which is the hovered tile's world origin — so each member's
  // `offset` is simply its cell's distance from the stamp's anchor.
  actor.graphics.use(
    new GraphicsGroup({
      useAnchor: false,
      members: preview.members,
    }),
  )
  actor.pos = new Vector(
    hover.tileMap.pos.x + hover.coords.x * hover.tileMap.tileWidth,
    hover.tileMap.pos.y + hover.coords.y * hover.tileMap.tileHeight,
  )
  actor.graphics.isVisible = true
}

/** What the ghost needs to draw: one offset sprite per cell the stroke would write. */
interface PreviewBlock {
  members: Array<{ offset: Vector; graphic: Sprite }>
}

/** One cell the ghost covers: where it lands, and the sprite that would show there. */
interface PreviewCell {
  tileX: number
  tileY: number
  sprite: Sprite
}

/**
 * The resolved brush: which cells get written, in which plane. The
 * sprite is resolved per branch — a stamp carries global tile ids, a
 * terrain comes back from the planner as per-set refs — so everything
 * below this point draws one kind of thing.
 */
interface PreviewTarget {
  cells: PreviewCell[]
  plane: LayerPlane
}

/**
 * Return the offset sprites to ghost at the hover position, or `null`
 * when any precondition is missing or nothing resolves. Split out so
 * {@link refreshPencilPreview} has a single "draw vs. hide" branch
 * instead of seven nested guards.
 */
function resolvePreviewBlock(scene: Scene, hover: PencilPreviewHover | null): PreviewBlock | null {
  const target = hover && resolvePreviewTarget(scene, hover)
  if (!target || !hover) return null

  // Tint by the target layer's plane (REDESIGN.md § 6.3): the ghost is
  // the only thing on screen that says WHERE the next stroke lands, and
  // on a map with layers in three planes the tile alone doesn't say it.
  // Multiplied, so it reads as a wash over the real tile.
  const tint = Color.fromHex(PLANE_TINT[target.plane])
  const members: PreviewBlock['members'] = []
  for (const cell of target.cells) {
    // Clone — sharing one Sprite across draw targets causes per-frame
    // transform corruption (same invariant `tile-graphics.manager`
    // relies on). Cheap at human mouse-move rate.
    const cloned = cell.sprite.clone()
    cloned.opacity = EDITOR_CONSTANTS.PAINT_PREVIEW_OPACITY
    cloned.tint = tint
    members.push({
      offset: new Vector(
        (cell.tileX - hover.coords.x) * hover.tileMap.tileWidth,
        (cell.tileY - hover.coords.y) * hover.tileMap.tileHeight,
      ),
      graphic: cloned,
    })
  }
  return members.length > 0 ? { members } : null
}

/** The scene preconditions, and the cells the armed brush would write from here. */
function resolvePreviewTarget(scene: Scene, hover: PencilPreviewHover): PreviewTarget | null {
  const tool = SessionState.get(scene, ActiveToolComponent)?.tool
  if (tool !== 'pencil') return null

  const mapScene = scene as MapScene
  const mapResource = mapScene.mapResource
  if (!mapResource) return null

  const layerId = SessionState.get(scene, ActiveLayerComponent)?.layerId ?? mapResource.getFirstLayerId?.()
  if (!layerId) return null

  const layer = mapResource.mapData?.layers.find((l) => l.id === layerId)
  if (layer?.locked) return null
  const plane = layer?.plane ?? DEFAULT_LAYER_PLANE

  // Clipped to the map, so the ghost shows exactly what the stroke
  // writes — a brush hanging over the edge paints only the part that
  // fits, and a ghost that promised more would be a lie.
  const mapData = mapResource.mapData
  const bounds = mapData ? { columns: mapData.columns, rows: mapData.rows } : undefined

  // The armed terrain wins, exactly as the click does
  // (`TileEditorSystem.applyMutatingTool`): the two are mutually
  // exclusive, so this is a preference only in the ordering sense.
  const terrain = SessionState.get(scene, ActiveTerrainComponent)?.address
  if (terrain) {
    const cells = resolveTerrainCells(mapScene, hover, mapResource, layerId, terrain, bounds)
    return cells ? { cells, plane } : null
  }

  const stamp = SessionState.get(scene, ActiveTileComponent)?.stamp
  if (!stamp) return null

  const cells: PreviewCell[] = []
  for (const cell of stampCellsAt(stamp, hover.coords, bounds)) {
    const sprite = resolveCellSprite(mapResource, cell.spriteId)
    if (sprite) cells.push({ tileX: cell.tileX, tileY: cell.tileY, sprite })
  }
  return cells.length > 0 ? { cells, plane } : null
}

/**
 * The armed terrain's footprint at the hover, each cell carrying the
 * sprite the PLANNER resolves for it — not a fixed icon. That is what
 * makes the ghost honest: a pond hovered against grass already shows
 * its shore the right way round, and the same brush one cell further
 * shows a different piece (TERRAIN.md §6.2).
 *
 * Only the footprint is ghosted. The planner also re-resolves the ring
 * around it, but washing the neighbours would make the brush look
 * bigger than the cells the click actually claims.
 *
 * A footprint cell the plan leaves alone already shows exactly this
 * brush; it is ghosted with what is there, so hovering over terrain the
 * click would not change still outlines the whole footprint instead of
 * going partly invisible.
 */
function resolveTerrainCells(
  scene: MapScene,
  hover: PencilPreviewHover,
  mapResource: MapResource,
  layerId: string,
  terrain: TerrainAddress,
  bounds: { columns: number; rows: number } | undefined,
): PreviewCell[] | null {
  const catalog = terrainCatalogForMap(mapResource)
  const data = catalog.terrainAt(terrain)
  if (!data) return null

  const found = findTileMapForLayer(scene, layerId)
  if (!found) return null

  const footprint = terrainFootprintCells(data, hover.coords.x, hover.coords.y).filter(
    (cell) => !bounds || (cell.x >= 0 && cell.y >= 0 && cell.x < bounds.columns && cell.y < bounds.rows),
  )
  if (footprint.length === 0) return null

  const plan = planTerrainEdit({
    editor: found.editor,
    layerId,
    catalog,
    bounds,
    intents: [{ kind: 'terrain', x: hover.coords.x, y: hover.coords.y, terrain }],
  })
  const planned = new Map(plan.cells.map((cell) => [`${cell.tileX},${cell.tileY}`, cell.sprites]))

  const cells: PreviewCell[] = []
  for (const cell of footprint) {
    const sprites = planned.get(`${cell.x},${cell.y}`) ?? snapshotPreviousSprites(found.editor, layerId, cell.x, cell.y)
    // The terrain lands on top of whatever floor the cell keeps (§3.4),
    // so the last sprite is the one the brush put there.
    const top = sprites[sprites.length - 1]
    if (!top) continue
    const sprite = mapResource.getSpriteSetResource(top.spriteSetId)?.sprites[top.spriteId]
    if (sprite) cells.push({ tileX: cell.x, tileY: cell.y, sprite })
  }
  return cells.length > 0 ? cells : null
}

/** The sprite a global tile id draws as on this map, or `null`. */
function resolveCellSprite(mapResource: MapResource, spriteId: number): Sprite | null {
  const info = findSpriteInfoForTileId(mapResource, spriteId)
  if (!info) return null
  return mapResource.getSpriteSetResource(info.spriteSetId)?.sprites[info.spriteId] ?? null
}
