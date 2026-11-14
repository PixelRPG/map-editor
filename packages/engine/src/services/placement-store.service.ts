import type { MapScene } from '../scenes/map.scene.ts'
import type { ObjectPlacement } from '../types/data/index.ts'

/**
 * The one writer for `MapData.objectPlacements` + the live placement
 * actors. Data and scene have to move together: a placement in the
 * array without an actor is invisible until the next reload, an actor
 * without an array entry vanishes on save. Both verbs are used by the
 * object commands (place / remove one) and by the layer-content
 * commands (duplicate / remove a layer carries every placement on it),
 * so they live here rather than privately inside one command file.
 *
 * Keyed by `ObjectPlacement.id` throughout — never an Excalibur runtime
 * `Entity.id` (AGENTS.md [Transport-ready primitives] rule 1).
 */

/** Add the placement to data + scene, replacing one with the same id. */
export function attachPlacement(scene: MapScene, placement: ObjectPlacement): void {
  const mapData = scene.mapResource.mapData
  if (!mapData) return
  mapData.objectPlacements ??= []
  const list = mapData.objectPlacements
  const idx = list.findIndex((p) => p.id === placement.id)
  if (idx >= 0) list[idx] = placement
  else list.push(placement)
  scene.despawnPlacement(placement.id) // avoid a duplicate if one already exists
  scene.spawnPlacement(placement)
}

/** Remove the placement (by id) from data + scene. */
export function detachPlacement(scene: MapScene, placementId: string): void {
  const mapData = scene.mapResource.mapData
  if (mapData?.objectPlacements) {
    mapData.objectPlacements = mapData.objectPlacements.filter((p) => p.id !== placementId)
  }
  scene.despawnPlacement(placementId)
}
