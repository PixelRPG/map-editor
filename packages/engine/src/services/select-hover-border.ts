import { Actor, Color, Rectangle, type Scene, type TileMap, Vector, vec } from 'excalibur'
import { ActiveToolComponent, TIER_Z } from '../components/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { SessionState } from '../utils/session-state.ts'

/**
 * Select-tool hover border — a single coloured rectangle outlining
 * the tile under the pointer while the `'select'` tool is active.
 * The border colour signals what clicking would target:
 *
 * - {@link EDITOR_CONSTANTS.HOVER_OBJECT_BORDER_COLOR} when an
 *   `ObjectPlacement` occupies the hovered tile — clicking would
 *   select it.
 * - {@link EDITOR_CONSTANTS.HOVER_TILE_BORDER_COLOR} otherwise —
 *   clicking would clear the current selection.
 *
 * Owner contract mirrors `pencil-preview.ts`: caller (the
 * `TileEditorSystem`) holds the actor + the current hover state and
 * calls {@link refreshSelectHoverBorder} on every hover-change. The
 * service resolves "should I be visible / what colour" against the
 * scene's session state — callers don't reproduce that branching.
 *
 * One actor across the scene's lifetime: hover can only land on one
 * tile at a time, so there's nothing to pool. Recolouring happens
 * in place via `Rectangle.strokeColor`; no per-frame allocation.
 */

/** Hover context the caller hands to {@link refreshSelectHoverBorder}. */
export interface SelectHoverBorderContext {
  tileMap: TileMap
  coords: { x: number; y: number }
}

/** Internal: the cached `Rectangle` graphic so we can re-tint it without rebuilding the actor. */
interface SelectHoverBorderInternals {
  rect: Rectangle
  /** Last applied tile size — rebuild the rect when the active tilemap's tile size changes. */
  tileWidth: number
  tileHeight: number
}

const internals = new WeakMap<Actor, SelectHoverBorderInternals>()

/**
 * Construct the hover-border actor. Top-left anchored so `pos` maps
 * directly to a tile's world-space origin (matches `pencil-preview`'s
 * placement maths). Z-pinned above every painted tile + above the
 * selection ring so a hovered-but-already-selected object reads as
 * "hover" while the pointer is over it.
 */
export function createSelectHoverBorderActor(): Actor {
  const actor = new Actor({
    name: 'select-hover-border',
    anchor: vec(0, 0),
  })
  actor.z = TIER_Z.overlay + 50
  actor.graphics.anchor = vec(0, 0)
  actor.graphics.visible = false
  return actor
}

/**
 * Reconcile the hover-border actor with the scene's current state.
 * Pass `hover = null` to hide (pointer left the map). All other hide
 * conditions are resolved internally:
 *
 * - Active tool isn't `'select'` (pencil / eraser / eyedropper
 *   suppress the border so the corresponding tools' own previews
 *   own the overlay slot).
 *
 * Idempotent — safe to call on every pointer move and on every
 * `ActiveToolComponent` mutation.
 */
export function refreshSelectHoverBorder(actor: Actor, scene: Scene, hover: SelectHoverBorderContext | null): void {
  const tool = SessionState.get(scene, ActiveToolComponent)?.tool
  if (tool !== 'select' || !hover) {
    actor.graphics.visible = false
    return
  }

  const rect = ensureRect(actor, hover.tileMap)
  rect.strokeColor = Color.fromHex(resolveHoverBorderColor(scene, hover))
  actor.pos = new Vector(
    hover.tileMap.pos.x + hover.coords.x * hover.tileMap.tileWidth,
    hover.tileMap.pos.y + hover.coords.y * hover.tileMap.tileHeight,
  )
  actor.graphics.visible = true
}

/**
 * Return a fresh `Rectangle` sized to the active tilemap's tile, or
 * the cached one when the size hasn't changed. Tilemaps in the editor
 * are fixed-size per scene, so the rect is built once and re-coloured
 * for subsequent hovers — keeping per-move allocation off the hot path.
 */
function ensureRect(actor: Actor, tileMap: TileMap): Rectangle {
  const cached = internals.get(actor)
  if (cached && cached.tileWidth === tileMap.tileWidth && cached.tileHeight === tileMap.tileHeight) {
    return cached.rect
  }
  const rect = new Rectangle({
    width: tileMap.tileWidth,
    height: tileMap.tileHeight,
    color: Color.Transparent,
    strokeColor: Color.fromHex(EDITOR_CONSTANTS.HOVER_TILE_BORDER_COLOR),
    lineWidth: EDITOR_CONSTANTS.HOVER_BORDER_LINE_WIDTH,
  })
  actor.graphics.use(rect)
  internals.set(actor, {
    rect,
    tileWidth: tileMap.tileWidth,
    tileHeight: tileMap.tileHeight,
  })
  return rect
}

/**
 * Pick the border colour for the current hover. Object placements
 * win over empty tile cells; cross-layer scan because the select
 * tool selects across all layers (not gated by the active layer like
 * paint / erase).
 */
function resolveHoverBorderColor(scene: Scene, hover: SelectHoverBorderContext): string {
  const mapResource = (scene as MapScene).mapResource
  const placements = mapResource?.mapData?.objectPlacements ?? []
  const hasObject = placements.some((p) => p.tileX === hover.coords.x && p.tileY === hover.coords.y)
  return hasObject ? EDITOR_CONSTANTS.HOVER_OBJECT_BORDER_COLOR : EDITOR_CONSTANTS.HOVER_TILE_BORDER_COLOR
}
