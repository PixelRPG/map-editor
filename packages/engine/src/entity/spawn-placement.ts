import { Actor, type Entity, vec } from 'excalibur'
import { PlacementIdComponent, TileTransformComponent } from '../components/index.ts'
import { TIER_Z } from '../components/tilemap-tier.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { isLayerVisible } from '../services/layer-visibility.ts'
import type { EntityDefinition, ObjectPlacement } from '../types/data/index.ts'
import { DEFAULT_LAYER_TIER, type LayerData } from '../types/data/LayerData.ts'
import type { ComponentSpecRegistry } from './component-spec.ts'
import { buildPlacementGraphic } from './placement-graphic.ts'
import { BUILT_IN_COMPONENT_SPECS } from './registry.ts'

/**
 * Build one Excalibur entity from a placement + its resolved definition,
 * by walking the definition's `components[]` through the registry: an
 * `Actor` at the tile centre, always-on `TileTransform` + `PlacementId`,
 * each component instantiated by its spec, the tile-like framed graphic
 * from {@link buildPlacementGraphic} (sprite fitted into the cell, or a
 * type-coloured marker for sprite-less placements), z from the layer's
 * tier, and the layer's visibility flag respected.
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
  for (const comp of def.components) {
    const spec = registry[comp.type]
    if (!spec) continue // load-time validation rejects unknowns; defensive here
    const built = spec.build(comp, ctx)
    if (built) {
      for (const c of Array.isArray(built) ? built : [built]) actor.addComponent(c)
    }
  }
  actor.graphics.use(buildPlacementGraphic(def, mapResource, tileWidth, tileHeight, registry))
  actor.graphics.anchor = vec(0.5, 0.5)

  const layer = layersById.get(placement.layerId)
  actor.z = TIER_Z[layer?.tier ?? DEFAULT_LAYER_TIER]
  if (!isLayerVisible(mapResource, placement.layerId)) actor.graphics.visible = false

  return actor
}
