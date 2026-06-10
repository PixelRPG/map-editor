import { Actor, type GraphicsGroup, type Scene, type TileMap, Vector, vec } from 'excalibur'
import { ActiveLayerComponent, ActiveObjectComponent, ActiveToolComponent, TIER_Z } from '../components/index.ts'
import { buildPlacementGraphic } from '../entity/placement-graphic.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import type { EntityDefinition } from '../types/data/index.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { SessionState } from '../utils/session-state.ts'

/**
 * Object-tool hover preview — a half-transparent ghost of the armed
 * object brush that follows the pointer on the active map, so placing a
 * library object feels like painting a tile (its tile-twin is
 * `services/pencil-preview.ts`). The ghost is the exact graphic the
 * placement will get (`entity/placement-graphic.ts`): framed cell +
 * fitted sprite, or frame + type marker for a sprite-less definition —
 * so every armed brush previews, appearance or not.
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
 * Per-actor cache of the built ghost graphic. Rebuilding the framed
 * `GraphicsGroup` rasterizes two canvas textures, so doing it on every
 * pointer move would churn; the def's object identity invalidates the
 * cache (the entity library is replaced wholesale on edits).
 */
const ghostCache = new WeakMap<
  Actor,
  { def: EntityDefinition; tileWidth: number; tileHeight: number; graphic: GraphicsGroup }
>()

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
 * - The armed def no longer exists in the entity library
 * - The active layer is locked (a click would no-op)
 *
 * Idempotent — safe to call on every pointer move + on every
 * `ActiveTool` / `ActiveObject` / `ActiveLayer` mutation.
 */
export function refreshObjectPreview(actor: Actor, scene: Scene, hover: ObjectPreviewHover | null): void {
  const def = hover ? resolveArmedDefinition(scene) : null
  if (!def || !hover) {
    actor.graphics.visible = false
    return
  }

  const { tileWidth, tileHeight } = hover.tileMap
  let cached = ghostCache.get(actor)
  if (!cached || cached.def !== def || cached.tileWidth !== tileWidth || cached.tileHeight !== tileHeight) {
    const graphic = buildPlacementGraphic(def, (scene as MapScene).mapResource, tileWidth, tileHeight)
    graphic.opacity = EDITOR_CONSTANTS.PAINT_PREVIEW_OPACITY
    cached = { def, tileWidth, tileHeight, graphic }
    ghostCache.set(actor, cached)
  }

  actor.graphics.use(cached.graphic)
  actor.pos = new Vector(
    hover.tileMap.pos.x + hover.coords.x * tileWidth,
    hover.tileMap.pos.y + hover.coords.y * tileHeight,
  )
  actor.graphics.visible = true
}

/**
 * Resolve the armed brush to its library definition, or `null` when any
 * precondition is missing. Split out so {@link refreshObjectPreview} has
 * one "draw vs. hide" branch instead of nested guards.
 */
function resolveArmedDefinition(scene: Scene): EntityDefinition | null {
  const tool = SessionState.get(scene, ActiveToolComponent)?.tool
  if (tool !== 'object') return null

  const defId = SessionState.get(scene, ActiveObjectComponent)?.defId
  if (!defId) return null

  const mapResource = (scene as MapScene).mapResource
  if (!mapResource) return null

  const layerId = SessionState.get(scene, ActiveLayerComponent)?.layerId ?? mapResource.getFirstLayerId?.()
  const layer = layerId ? mapResource.mapData?.layers.find((l) => l.id === layerId) : null
  if (layer?.locked) return null

  return (scene as MapScene).entityLibrary?.find((e) => e.id === defId) ?? null
}
