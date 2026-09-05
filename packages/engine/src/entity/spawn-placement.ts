import { Actor, type Entity, vec } from 'excalibur'
import { PlacementIdComponent, TileTransformComponent } from '../components/index.ts'
import { zFor } from '../components/tilemap-plane.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { isLayerVisible } from '../services/layer-visibility.ts'
import type { EntityDefinition, ObjectPlacement } from '../types/data/index.ts'
import { DEFAULT_LAYER_PLANE, type LayerData } from '../types/data/LayerData.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import type { ComponentSpecRegistry } from './component-spec.ts'
import { buildPlacementGraphic, type PlacementGraphicOptions } from './placement-graphic.ts'
import { BUILT_IN_COMPONENT_SPECS } from './registry.ts'
import { validateEntityDefinition } from './validate.ts'

/**
 * Build one Excalibur entity from a placement + its resolved definition,
 * by walking the definition's `components[]` through the registry: an
 * `Actor` at the tile centre, always-on `TileTransform` + `PlacementId`,
 * each component instantiated by its spec, the tile-like framed graphic
 * from {@link buildPlacementGraphic} (sprite fitted into the cell, or a
 * type-coloured marker for sprite-less placements), z from the layer's
 * plane, and the layer's visibility flag respected.
 */
export function buildPlacementEntity(
  placement: ObjectPlacement,
  def: EntityDefinition,
  mapResource: MapResource,
  layersById: ReadonlyMap<string, LayerData>,
  registry: ComponentSpecRegistry = BUILT_IN_COMPONENT_SPECS,
  options: PlacementGraphicOptions = {},
): Entity {
  const mapData = mapResource.mapData
  const tileWidth = mapData?.tileWidth ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE
  const tileHeight = mapData?.tileHeight ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE

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
  applyPlacementGraphic(actor, def, mapResource, registry, options)

  const layer = layersById.get(placement.layerId)
  actor.z = zFor(layer?.plane ?? DEFAULT_LAYER_PLANE)
  if (!isLayerVisible(mapResource, placement.layerId)) actor.graphics.visible = false

  return actor
}

/**
 * (Re)apply a placement actor's tile-like graphic for the given mode.
 * Shared by {@link buildPlacementEntity} (spawn) and the editor↔runtime
 * toggle (`MapScene.refreshPlacementGraphicsForMode`), so switching into
 * playtest re-renders every placement without its editor chrome (frame +
 * logic markers) and switching back restores it.
 */
export function applyPlacementGraphic(
  actor: Actor,
  def: EntityDefinition,
  mapResource: MapResource,
  registry: ComponentSpecRegistry = BUILT_IN_COMPONENT_SPECS,
  options: PlacementGraphicOptions = {},
): void {
  const mapData = mapResource.mapData
  const tileWidth = mapData?.tileWidth ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE
  const tileHeight = mapData?.tileHeight ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE
  actor.graphics.use(buildPlacementGraphic(def, mapResource, tileWidth, tileHeight, registry, options))
  actor.graphics.anchor = vec(0.5, 0.5)
}

/**
 * Diagnostic warnings for a placement about to spawn, evaluated against
 * its resolved definition (`null` when the `defId` didn't resolve against
 * the entity library, or an inline def was absent). Pure + node-testable;
 * {@link ObjectSpawnSystem} logs the result.
 *
 * Warn-only by design: a leniently-saved draft (a placement whose required
 * fields aren't filled in yet — the save path allows it, see
 * {@link validateEntityDefinition}'s `requireComplete`) still spawns
 * best-effort rather than vanishing from a shipped map, but the integrity
 * gap is surfaced instead of staying silent. An unresolved `defId` (the
 * entity it pointed at was deleted) is the only case that can't spawn.
 */
export function placementSpawnWarnings(
  placement: ObjectPlacement,
  def: EntityDefinition | null,
  registry: ComponentSpecRegistry = BUILT_IN_COMPONENT_SPECS,
): string[] {
  if (!def) {
    const ref = placement.defId ? `defId "${placement.defId}"` : 'an inline definition'
    return [`placement "${placement.id}" references ${ref} that did not resolve — not spawned`]
  }
  const errors = validateEntityDefinition(def, registry, true)
  if (errors.length === 0) return []
  return [`placement "${placement.id}" ("${def.id}") has an incomplete definition: ${errors.join('; ')}`]
}
