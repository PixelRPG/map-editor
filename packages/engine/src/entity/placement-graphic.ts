import { Color, GraphicsGroup, type GraphicsGrouping, Polygon, Rectangle, vec } from 'excalibur'
import type { MapResource } from '../resource/MapResource.ts'
import type { ComponentData, EntityDefinition } from '../types/data/index.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import type { ComponentSpecRegistry } from './component-spec.ts'
import { BUILT_IN_COMPONENT_SPECS } from './registry.ts'
import { buildVisualGraphic } from './visual-graphic.ts'

/**
 * Tile-like placement visuals — the single source for how an object
 * placement looks on the map: a tile-sized frame (the object accent
 * colour, same hue as the object hover border) holding either the
 * definition's appearance sprite scaled to fit the cell, or — for a
 * sprite-less definition — a diamond marker in the dominant marker
 * component's colour ("a sign for the object type").
 *
 * Used by both the spawn pipeline (`spawn-placement.ts`) and the
 * object-tool hover ghost (`services/object-preview.ts`), so the
 * preview is pixel-identical to the placed result.
 */

/** Outline colour for a sprite-less placement carrying no marker component. */
const FALLBACK_MARKER_COLOR = '#ff9966'

/**
 * Priority order for a sprite-less placement that carries several
 * marker components — the first match's `editor.markerColor` wins.
 * Preserves the pre-refactor per-kind colours (teleport/item/spawn-point
 * /npc/event), now derived from the components instead of a `kind`.
 */
const MARKER_PRIORITY = ['teleport', 'item', 'spawn-point', 'npc-route', 'dialogue', 'trigger'] as const

/** Resolve the marker colour for a component set (see {@link MARKER_PRIORITY}). */
export function markerColorFor(
  components: readonly ComponentData[],
  registry: ComponentSpecRegistry = BUILT_IN_COMPONENT_SPECS,
): string {
  const types = new Set(components.map((c) => c.type))
  for (const t of MARKER_PRIORITY) {
    const color = types.has(t) ? registry[t]?.editor.markerColor : undefined
    if (color) return color
  }
  return FALLBACK_MARKER_COLOR
}

/**
 * Contain-fit scale factor: the largest factor that fits `width × height`
 * inside `maxWidth × maxHeight` preserving aspect. May scale up (a tiny
 * item icon grows to cell size) as well as down (an NPC sheet cell
 * shrinks into the tile grid). Returns 1 for degenerate inputs.
 */
export function fitContainScale(width: number, height: number, maxWidth: number, maxHeight: number): number {
  if (width <= 0 || height <= 0 || maxWidth <= 0 || maxHeight <= 0) return 1
  return Math.min(maxWidth / width, maxHeight / height)
}

/**
 * Inset between the cell frame and the sprite, so the sprite reads as
 * "slightly smaller than a tile, inside a frame". 1px on 16px tiles,
 * scales with the tile size.
 */
export function frameInset(tileWidth: number, tileHeight: number): number {
  return Math.max(1, Math.round(Math.min(tileWidth, tileHeight) * 0.07))
}

/**
 * Build the tile-like graphic for one resolved placement definition:
 * a `GraphicsGroup` of [cell frame, content]. Content is the `visual`
 * component's sprite/animation contain-fitted into the framed cell, or
 * the type-coloured diamond marker when no sprite resolves.
 *
 * The group's local bounds are exactly `tileWidth × tileHeight`, so an
 * anchor of (0.5, 0.5) centres it on a tile-centre actor and (0, 0)
 * pins it to a tile origin (the hover ghost).
 */
export function buildPlacementGraphic(
  def: EntityDefinition,
  mapResource: MapResource,
  tileWidth: number,
  tileHeight: number,
  registry: ComponentSpecRegistry = BUILT_IN_COMPONENT_SPECS,
): GraphicsGroup {
  const frame = new Rectangle({
    width: tileWidth,
    height: tileHeight,
    color: Color.Transparent,
    strokeColor: Color.fromHex(EDITOR_CONSTANTS.HOVER_OBJECT_BORDER_COLOR),
    lineWidth: 1,
  })
  const members: GraphicsGrouping[] = [{ offset: vec(0, 0), graphic: frame }]

  const visualData = def.components.find((c) => c.type === 'visual')
  const sprite = visualData ? buildVisualGraphic(visualData, mapResource) : null
  if (sprite) {
    const inset = frameInset(tileWidth, tileHeight)
    const scale = fitContainScale(sprite.width, sprite.height, tileWidth - 2 * inset, tileHeight - 2 * inset)
    sprite.scale = vec(scale, scale)
    // sprite.width / .height include the scale from here on.
    members.push({
      offset: vec((tileWidth - sprite.width) / 2, (tileHeight - sprite.height) / 2),
      graphic: sprite,
    })
  } else {
    const r = Math.max(2, Math.round(Math.min(tileWidth, tileHeight) * 0.25))
    const diamond = new Polygon({
      points: [vec(r, 0), vec(2 * r, r), vec(r, 2 * r), vec(0, r)],
      color: Color.fromHex(markerColorFor(def.components, registry)),
    })
    members.push({ offset: vec(tileWidth / 2 - r, tileHeight / 2 - r), graphic: diamond })
  }

  return new GraphicsGroup({ members })
}
