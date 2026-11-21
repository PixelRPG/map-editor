import { Actor, CollisionType, type Entity, type Graphic, vec } from 'excalibur'
import { EntityStatesComponent, PlacementIdComponent, TileTransformComponent } from '../components/index.ts'
import { zFor } from '../components/tilemap-plane.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { isLayerVisible } from '../services/layer-visibility.ts'
import type { ActionData } from '../types/data/ActionData.ts'
import type { EntityDefinition, ObjectPlacement } from '../types/data/index.ts'
import { DEFAULT_LAYER_PLANE, type LayerData } from '../types/data/LayerData.ts'
import { getComponentData } from './data-access.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import type { ComponentSpecRegistry } from './component-spec.ts'
import { buildPlacementDot, buildPlacementGraphic, type PlacementGraphicOptions } from './placement-graphic.ts'
import { BUILT_IN_COMPONENT_SPECS } from './registry.ts'
import { validateEntityDefinitionDetailed } from './validate.ts'

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
    // Placements are logic + graphics on a tile grid: contact (hostile
    // damage, triggers) is a tile/pixel distance test, never a physics
    // event. A default `Passive` actor would still be scanned against the
    // tilemap's boxes by the broadphase every run frame (2,070 of them on
    // the 256x256 bench map: 25 ms), so the box stays only as geometry.
    collisionType: CollisionType.PreventCollision,
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
  // Conditional states are definition-level, not a component, so the
  // registry walk above never sees them — attach the runtime half here so
  // `StateSystem` can resolve them against the flag store.
  if (def.states && def.states.length > 0) {
    const baseActions = (getComponentData(def, 'actions')?.actions as ActionData[] | undefined) ?? []
    actor.addComponent(new EntityStatesComponent(def.states, baseActions))
  }
  applyPlacementGraphic(actor, def, mapResource, registry, options)

  const layer = layersById.get(placement.layerId)
  actor.z = zFor(layer?.plane ?? DEFAULT_LAYER_PLANE)
  if (!isLayerVisible(mapResource, placement.layerId)) actor.graphics.isVisible = false

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
  stashedGraphics.delete(actor)
  actor.graphics.use(buildPlacementGraphic(def, mapResource, tileWidth, tileHeight, registry, options))
  actor.graphics.anchor = vec(0.5, 0.5)
}

/** The full graphic of an actor currently drawn as a dot, so leaving dot mode restores it without a rebuild. */
const stashedGraphics = new WeakMap<Actor, Graphic>()

/**
 * Switch one placement actor between its full graphic and the far-zoom
 * dot (`ZoomLimitsComponent.dots`). Idempotent. Runs once per actor per
 * threshold crossing, never per frame.
 */
export function applyPlacementDot(
  actor: Actor,
  def: EntityDefinition,
  mapResource: MapResource,
  dot: boolean,
  registry: ComponentSpecRegistry = BUILT_IN_COMPONENT_SPECS,
): void {
  if (dot) {
    const current = actor.graphics.current
    if (!stashedGraphics.has(actor) && current) stashedGraphics.set(actor, current)
    const mapData = mapResource.mapData
    const tileWidth = mapData?.tileWidth ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE
    const tileHeight = mapData?.tileHeight ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE
    actor.graphics.use(buildPlacementDot(def, tileWidth, tileHeight, registry))
    return
  }
  const full = stashedGraphics.get(actor)
  if (!full) return
  stashedGraphics.delete(actor)
  actor.graphics.use(full)
}

/**
 * Diagnostic warnings for a placement about to spawn, evaluated against
 * its resolved definition (`null` when the `defId` didn't resolve against
 * the entity library, or an inline def was absent). Pure + node-testable;
 * {@link ObjectSpawnSystem} logs the result.
 *
 * Warn-only by design: a leniently-saved draft (a placement whose required
 * fields aren't filled in yet — the save path allows it, see
 * {@link validateEntityDefinitionDetailed}'s `requireComplete`) still spawns
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
  // `knownRegistry` is the full built-in set, so a component belonging to
  // a switched-OFF game system lands in `dormant` and warns about nothing:
  // it is deliberately inert, not a broken definition.
  const { errors } = validateEntityDefinitionDetailed(def, {
    registry,
    requireComplete: true,
    knownRegistry: BUILT_IN_COMPONENT_SPECS,
  })
  if (errors.length === 0) return []
  return [`placement "${placement.id}" ("${def.id}") has an incomplete definition: ${errors.join('; ')}`]
}
