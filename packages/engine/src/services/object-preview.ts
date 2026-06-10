import { Actor, type Scene, type Sprite, type TileMap, Vector, vec } from 'excalibur'
import { ActiveLayerComponent, ActiveObjectComponent, ActiveToolComponent, TIER_Z } from '../components/index.ts'
import { getComponentData } from '../entity/data-access.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { SessionState } from '../utils/session-state.ts'

/**
 * Object-tool hover preview — a half-transparent ghost of the armed
 * object brush's appearance that follows the pointer on the active map,
 * so placing a library object feels like painting a tile (its tile-twin
 * is `services/pencil-preview.ts`). Renders as a regular scene `Actor`
 * above every tilemap tier; spawn / despawn rebuilds don't disturb it.
 *
 * Owner contract mirrors the pencil preview: the caller holds the actor +
 * the current hover state and hands both to {@link refreshObjectPreview};
 * the helper resolves every show/hide precondition against the scene's
 * session state.
 */

/** Hover context the caller hands to {@link refreshObjectPreview}. */
export interface ObjectPreviewHover {
  tileMap: TileMap
  coords: { x: number; y: number }
}

/**
 * Construct the preview actor. Top-left anchored so `pos` maps directly
 * to a tile's world-space origin; z-pinned above the highest tilemap
 * tier so the ghost sits on top of every painted tile + placed object.
 */
export function createObjectPreviewActor(): Actor {
  const actor = new Actor({ name: 'object-place-preview', anchor: vec(0, 0) })
  actor.z = TIER_Z.overlay + 50
  actor.graphics.anchor = vec(0, 0)
  actor.graphics.visible = false
  return actor
}

/**
 * Reconcile the preview actor with the scene's current editor state.
 * Pass `hover = null` to hide (pointer off the map). Other hide
 * conditions resolved internally:
 *
 * - Active tool isn't `'object'`
 * - No object brush armed (`ActiveObjectComponent.defId`)
 * - The armed def has no resolvable appearance sprite
 * - The active layer is locked (a click would no-op)
 *
 * Idempotent — safe to call on every pointer move + on every
 * `ActiveTool` / `ActiveObject` / `ActiveLayer` mutation.
 */
export function refreshObjectPreview(actor: Actor, scene: Scene, hover: ObjectPreviewHover | null): void {
  const sprite = resolvePreviewSprite(scene, hover)
  if (!sprite || !hover) {
    actor.graphics.visible = false
    return
  }
  // Clone — sharing one Sprite across draw targets corrupts per-frame
  // transforms (same invariant the pencil preview relies on).
  const cloned = sprite.clone()
  cloned.opacity = EDITOR_CONSTANTS.PAINT_PREVIEW_OPACITY
  actor.graphics.use(cloned)
  actor.pos = new Vector(
    hover.tileMap.pos.x + hover.coords.x * hover.tileMap.tileWidth,
    hover.tileMap.pos.y + hover.coords.y * hover.tileMap.tileHeight,
  )
  actor.graphics.visible = true
}

/**
 * Resolve the sprite to ghost at the hover position, or `null` when any
 * precondition is missing. Split out so {@link refreshObjectPreview} has
 * one "draw vs. hide" branch instead of nested guards.
 */
function resolvePreviewSprite(scene: Scene, hover: ObjectPreviewHover | null): Sprite | null {
  if (!hover) return null

  const tool = SessionState.get(scene, ActiveToolComponent)?.tool
  if (tool !== 'object') return null

  const defId = SessionState.get(scene, ActiveObjectComponent)?.defId
  if (!defId) return null

  const mapResource = (scene as MapScene).mapResource
  if (!mapResource) return null

  const layerId = SessionState.get(scene, ActiveLayerComponent)?.layerId ?? mapResource.getFirstLayerId?.()
  const layer = layerId ? mapResource.mapData?.layers.find((l) => l.id === layerId) : null
  if (layer?.locked) return null

  const def = (scene as MapScene).entityLibrary?.find((e) => e.id === defId)
  if (!def) return null
  const visual = getComponentData(def, 'visual')
  const spriteSetId = typeof visual?.spriteSetId === 'string' ? visual.spriteSetId : null
  if (!spriteSetId) return null
  const spriteId = typeof visual?.spriteId === 'number' ? visual.spriteId : 0

  return mapResource.getSpriteSetResource(spriteSetId)?.sprites[spriteId] ?? null
}
