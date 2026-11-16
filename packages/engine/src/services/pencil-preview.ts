import { Actor, Color, GraphicsGroup, type Scene, type Sprite, type TileMap, Vector, vec } from 'excalibur'
import { ActiveLayerComponent, ActiveTileComponent, ActiveToolComponent, zFor } from '../components/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { type TileStampCell, stampCellsAt } from '../resource/tile-stamp.ts'
import { DEFAULT_LAYER_PLANE, type LayerPlane } from '../types/data/LayerData.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { PLANE_TINT } from '../utils/plane-colour.ts'
import { SessionState } from '../utils/session-state.ts'
import { findSpriteInfoForTileId } from './sprite-info.resolver.ts'

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
 * Owner contract: caller holds the actor + the current hover state,
 * passes both to {@link refreshPencilPreview}. The helper resolves
 * preconditions (tool, active tile, layer lock, sprite resolution)
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
  actor.graphics.visible = false
  return actor
}

/**
 * Reconcile the preview actor with the scene's current editor state.
 * Pass `hover = null` to hide (pointer off the map). All other hide
 * conditions are resolved internally:
 *
 * - Active tool isn't `'pencil'` (eraser / select / etc. suppress)
 * - No active tile id picked yet
 * - Active layer is locked (paint would no-op)
 * - Sprite cannot be resolved on the active map
 *
 * Idempotent — safe to call on every pointer move and on every
 * `ActiveTool` / `ActiveTile` / `ActiveLayer` mutation.
 */
export function refreshPencilPreview(actor: Actor, scene: Scene, hover: PencilPreviewHover | null): void {
  const preview = resolvePreviewBlock(scene, hover)
  if (!preview || !hover) {
    actor.graphics.visible = false
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
  actor.graphics.visible = true
}

/** What the ghost needs to draw: one offset sprite per cell the stroke would write. */
interface PreviewBlock {
  members: Array<{ offset: Vector; graphic: Sprite }>
}

/** The resolved brush: which cells get written, in which plane, from which map. */
interface PreviewTarget {
  cells: TileStampCell[]
  plane: LayerPlane
  mapResource: MapResource
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
    const sprite = resolveCellSprite(target.mapResource, cell.spriteId)
    if (!sprite) continue
    // Clone — sharing one Sprite across draw targets causes per-frame
    // transform corruption (same invariant `tile-graphics.manager`
    // relies on). Cheap at human mouse-move rate.
    const cloned = sprite.clone()
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

/** The scene preconditions, and the cells the armed stamp would write from here. */
function resolvePreviewTarget(scene: Scene, hover: PencilPreviewHover): PreviewTarget | null {
  const tool = SessionState.get(scene, ActiveToolComponent)?.tool
  if (tool !== 'pencil') return null

  const stamp = SessionState.get(scene, ActiveTileComponent)?.stamp
  if (!stamp) return null

  const mapResource = (scene as MapScene).mapResource
  if (!mapResource) return null

  const layerId = SessionState.get(scene, ActiveLayerComponent)?.layerId ?? mapResource.getFirstLayerId?.()
  if (!layerId) return null

  const layer = mapResource.mapData?.layers.find((l) => l.id === layerId)
  if (layer?.locked) return null

  // Clipped to the map, so the ghost shows exactly what the stroke
  // writes — a stamp hanging over the edge paints only the part that
  // fits, and a ghost that promised more would be a lie.
  const bounds = mapResource.mapData
  const cells = stampCellsAt(stamp, hover.coords, bounds ? { columns: bounds.columns, rows: bounds.rows } : undefined)
  if (cells.length === 0) return null

  return { cells, plane: layer?.plane ?? DEFAULT_LAYER_PLANE, mapResource }
}

/** The sprite a global tile id draws as on this map, or `null`. */
function resolveCellSprite(mapResource: MapResource, spriteId: number): Sprite | null {
  const info = findSpriteInfoForTileId(mapResource, spriteId)
  if (!info) return null
  return mapResource.getSpriteSetResource(info.spriteSetId)?.sprites[info.spriteId] ?? null
}
