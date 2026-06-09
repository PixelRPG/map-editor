import { Actor, Color, type Entity, Rectangle, vec } from 'excalibur'
import { PlacementIdComponent, TileTransformComponent } from '../components/index.ts'
import { TIER_Z } from '../components/tilemap-tier.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { isLayerVisible } from '../services/layer-visibility.ts'
import type { ComponentData, EntityDefinition, ObjectPlacement } from '../types/data/index.ts'
import { DEFAULT_LAYER_TIER, type LayerData } from '../types/data/LayerData.ts'
import type { ComponentSpecRegistry } from './component-spec.ts'
import { mergePlacementComponents } from './data-access.ts'
import { BUILT_IN_COMPONENT_SPECS } from './registry.ts'
import { buildVisualGraphic } from './visual-graphic.ts'

/** Outline colour for a sprite-less placement carrying no marker component. */
const FALLBACK_MARKER_COLOR = '#ff9966'

/**
 * Priority order for a sprite-less placement that carries several
 * marker components — the first match's `editor.markerColor` wins.
 * Preserves the pre-refactor per-kind colours (teleport/item/spawn-point
 * /npc/event), now derived from the components instead of a `kind`.
 */
const MARKER_PRIORITY = ['teleport', 'item', 'spawn-point', 'npc-route', 'dialogue', 'trigger'] as const

/**
 * Resolve a placement to its effective {@link EntityDefinition}: an inline
 * definition, or a library lookup by `defId` with per-instance
 * `overrides` merged (name replace + wholesale-replace components per
 * `type`). Returns `null` if neither resolves.
 */
export function resolvePlacementDefinition(
  placement: ObjectPlacement,
  library: readonly EntityDefinition[],
): EntityDefinition | null {
  let base: EntityDefinition | null = null
  if (placement.inline) base = placement.inline
  else if (placement.defId) base = library.find((d) => d.id === placement.defId) ?? null
  if (!base) return null
  if (!placement.overrides) return base
  return {
    ...base,
    name: placement.overrides.name ?? base.name,
    components: mergePlacementComponents(base.components, placement.overrides.components),
  }
}

/**
 * Build one Excalibur entity from a placement + its resolved definition,
 * by walking the definition's `components[]` through the registry. Runtime
 * shape is identical to the pre-refactor kind-switch spawn: an `Actor` at
 * the tile centre, always-on `TileTransform` + `PlacementId`, each
 * component instantiated by its spec, the `visual` component's graphic
 * attached, a coloured outline marker for sprite-less placements, z from
 * the layer's tier, and the layer's visibility flag respected.
 */
export function buildPlacementEntity(
  placement: ObjectPlacement,
  def: EntityDefinition,
  mapResource: MapResource,
  layersById: ReadonlyMap<string, LayerData>,
  registry: ComponentSpecRegistry = BUILT_IN_COMPONENT_SPECS,
): Entity {
  const mapData = mapResource.mapData
  const tileWidth = mapData?.tileWidth ?? 16
  const tileHeight = mapData?.tileHeight ?? 16

  const actor = new Actor({
    name: `${def.editorData?.template ?? 'entity'}:${placement.id}`,
    x: placement.tileX * tileWidth + tileWidth / 2,
    y: placement.tileY * tileHeight + tileHeight / 2,
    width: tileWidth,
    height: tileHeight,
  })
  actor.addComponent(new TileTransformComponent(placement.tileX, placement.tileY, placement.layerId))
  actor.addComponent(new PlacementIdComponent(placement.id))

  const ctx = { placementId: placement.id, tileX: placement.tileX, tileY: placement.tileY, tileWidth, tileHeight }
  let graphicAttached = false
  for (const comp of def.components) {
    const spec = registry[comp.type]
    if (!spec) continue // load-time validation rejects unknowns; defensive here
    const built = spec.build(comp, ctx)
    if (built) {
      for (const c of Array.isArray(built) ? built : [built]) actor.addComponent(c)
    }
    if (comp.type === 'visual') {
      const graphic = buildVisualGraphic(comp, mapResource)
      if (graphic) {
        actor.graphics.use(graphic)
        actor.graphics.anchor = vec(0.5, 0.5)
        graphicAttached = true
      }
    }
  }
  if (!graphicAttached) attachOutlineMarker(actor, def.components, tileWidth, tileHeight, registry)

  const layer = layersById.get(placement.layerId)
  actor.z = TIER_Z[layer?.tier ?? DEFAULT_LAYER_TIER]
  if (!isLayerVisible(mapResource, placement.layerId)) actor.graphics.visible = false

  return actor
}

function markerColorFor(components: ComponentData[], registry: ComponentSpecRegistry): string {
  const types = new Set(components.map((c) => c.type))
  for (const t of MARKER_PRIORITY) {
    const color = types.has(t) ? registry[t]?.editor.markerColor : undefined
    if (color) return color
  }
  return FALLBACK_MARKER_COLOR
}

function attachOutlineMarker(
  actor: Actor,
  components: ComponentData[],
  width: number,
  height: number,
  registry: ComponentSpecRegistry,
): void {
  const rect = new Rectangle({
    width,
    height,
    color: Color.Transparent,
    strokeColor: Color.fromHex(markerColorFor(components, registry)),
    lineWidth: 1,
  })
  actor.graphics.use(rect)
  actor.graphics.anchor = vec(0.5, 0.5)
}
