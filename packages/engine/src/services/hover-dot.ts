import { Actor, Circle, Color, type Scene, type TileMap, vec } from 'excalibur'
import { ActiveToolComponent, zFor } from '../components/index.ts'
import { ZoomLimitsComponent } from '../components/zoom-limits.component.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { SessionState } from '../utils/session-state.ts'

/** Whole tiles under the pointer: the far-zoom stand-in for every hover frame. */
export interface HoverDotContext {
  tileMap: TileMap
  coords: { x: number; y: number }
}

/** Tools that preview a click. The eyedropper reads a tile and draws nothing. */
export function toolHasHoverPreview(tool: string): boolean {
  return tool !== 'eyedropper'
}

/**
 * Whether the hover frames should collapse to a dot. Reads the SAME flag the
 * placements read (`ZoomLimitsComponent.dots`, set from `wantsDotLod`), so the
 * two paths flip at one zoom and cannot drift apart.
 */
export function hoverUsesDot(scene: Scene): boolean {
  return SessionState.get(scene, ZoomLimitsComponent)?.dots ?? false
}

/** One actor for the whole scene; recoloured and moved in place, never rebuilt per hover. */
export function createHoverDotActor(): Actor {
  const actor = new Actor({ name: 'hover-dot', anchor: vec(0.5, 0.5) })
  actor.z = zFor('overlay') + 50
  actor.graphics.isVisible = false
  return actor
}

/** Show the dot on the hovered tile, or hide it. Allocates only when the tile size changes. */
export function refreshHoverDot(actor: Actor, scene: Scene, hover: HoverDotContext | null): void {
  const tool = SessionState.get(scene, ActiveToolComponent)?.tool ?? 'select'
  if (!hover || !toolHasHoverPreview(tool)) {
    actor.graphics.isVisible = false
    return
  }
  const { tileWidth, tileHeight } = hover.tileMap
  // Whole pixels: a fractional radius makes a fractional texture the draw rejects.
  const radius = Math.max(1, Math.round(Math.min(tileWidth, tileHeight) / 3))
  const current = actor.graphics.current
  if (!(current instanceof Circle) || current.radius !== radius) {
    actor.graphics.use(new Circle({ radius, color: Color.fromHex(EDITOR_CONSTANTS.HOVER_TILE_BORDER_COLOR) }))
  }
  actor.pos.x = hover.tileMap.pos.x + (hover.coords.x + 0.5) * tileWidth
  actor.pos.y = hover.tileMap.pos.y + (hover.coords.y + 0.5) * tileHeight
  actor.graphics.isVisible = true
}
