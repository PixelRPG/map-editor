import { Actor, Color, type Scene, type Sprite, type TileMap, Vector, vec } from 'excalibur'
import { ActiveLayerComponent, ActiveTileComponent, ActiveToolComponent, zFor } from '../components/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { DEFAULT_LAYER_PLANE, type LayerPlane } from '../types/data/LayerData.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { PLANE_TINT } from '../utils/plane-colour.ts'
import { SessionState } from '../utils/session-state.ts'
import { findSpriteInfoForTileId } from './sprite-info.resolver.ts'

/**
 * Pencil-tool hover preview — a half-transparent ghost of the active
 * tile that follows the pointer on the active tilemap. Renders as a
 * regular scene `Actor` rather than a tile graphic, so paint / erase
 * rebuilds don't disturb it and the editor's `MapEditorComponent`
 * shadow state stays free of UI-only ephemera.
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
  const preview = resolvePreviewSprite(scene, hover)
  if (!preview || !hover) {
    actor.graphics.visible = false
    return
  }
  // Clone — sharing one Sprite across draw targets causes per-frame
  // transform corruption (same invariant `tile-graphics.manager`
  // relies on). Cheap at human mouse-move rate.
  const cloned = preview.sprite.clone()
  cloned.opacity = EDITOR_CONSTANTS.PAINT_PREVIEW_OPACITY
  // Tint by the target layer's plane (REDESIGN.md § 6.3): the ghost is
  // the only thing on screen that says WHERE the next stroke lands, and
  // on a map with layers in three planes the tile alone doesn't say it.
  // Multiplied, so it reads as a wash over the real tile.
  cloned.tint = Color.fromHex(PLANE_TINT[preview.plane])
  actor.graphics.use(cloned)
  actor.pos = new Vector(
    hover.tileMap.pos.x + hover.coords.x * hover.tileMap.tileWidth,
    hover.tileMap.pos.y + hover.coords.y * hover.tileMap.tileHeight,
  )
  actor.graphics.visible = true
}

/** What the ghost needs to draw: the sprite and the plane it lands in. */
interface PreviewSprite {
  sprite: Sprite
  plane: LayerPlane
}

/**
 * Return the sprite to ghost at the hover position with the active
 * layer's plane, or `null` when any precondition is missing. Split out
 * so {@link refreshPencilPreview} has a single "draw vs. hide" branch
 * instead of seven nested guards.
 */
function resolvePreviewSprite(scene: Scene, hover: PencilPreviewHover | null): PreviewSprite | null {
  if (!hover) return null

  const tool = SessionState.get(scene, ActiveToolComponent)?.tool
  if (tool !== 'pencil') return null

  const activeTileId = SessionState.get(scene, ActiveTileComponent)?.spriteId
  if (activeTileId === undefined) return null

  const mapResource = (scene as MapScene).mapResource
  if (!mapResource) return null

  const layerId = SessionState.get(scene, ActiveLayerComponent)?.layerId ?? mapResource.getFirstLayerId?.()
  if (!layerId) return null

  const layer = mapResource.mapData?.layers.find((l) => l.id === layerId)
  if (layer?.locked) return null

  const info = findSpriteInfoForTileId(mapResource, activeTileId)
  if (!info) return null

  const sprite = mapResource.getSpriteSetResource(info.spriteSetId)?.sprites[info.spriteId]
  if (!sprite) return null

  return { sprite, plane: layer?.plane ?? DEFAULT_LAYER_PLANE }
}
