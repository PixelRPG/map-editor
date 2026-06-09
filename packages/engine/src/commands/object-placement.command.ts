import type { Scene } from 'excalibur'
import { MapScene } from '../scenes/map.scene.ts'
import type { ObjectPlacement } from '../types/data/index.ts'
import type { Command } from './types.ts'

/** Payload of {@link PlaceObjectCommand} / {@link RemoveObjectCommand}. */
export interface ObjectPlacementPayload {
  /** The full placement (stable id) — carried whole so revert can restore it. */
  placement: ObjectPlacement
}

/** Add the placement to `mapData.objectPlacements`, replacing one with the same id. */
function addPlacement(scene: MapScene, placement: ObjectPlacement): void {
  const mapData = scene.mapResource.mapData
  if (!mapData) return
  const list = (mapData.objectPlacements ??= [])
  const idx = list.findIndex((p) => p.id === placement.id)
  if (idx >= 0) list[idx] = placement
  else list.push(placement)
  scene.despawnPlacement(placement.id) // avoid a duplicate if one already exists
  scene.spawnPlacement(placement)
}

/** Remove the placement (by id) from data + scene. */
function removePlacement(scene: MapScene, placementId: string): void {
  const mapData = scene.mapResource.mapData
  if (mapData?.objectPlacements) {
    mapData.objectPlacements = mapData.objectPlacements.filter((p) => p.id !== placementId)
  }
  scene.despawnPlacement(placementId)
}

/**
 * Place an object on the map: append the placement to
 * `mapData.objectPlacements` and spawn its entity live. Invertible —
 * `revert` removes it. Like every {@link Command} the payload is pure,
 * JSON-serialisable data (stable ids only) so it doubles as the undo
 * entry AND the wire message for peers.
 */
export class PlaceObjectCommand implements Command<ObjectPlacementPayload> {
  static readonly KIND = 'object.place'
  readonly kind = PlaceObjectCommand.KIND

  constructor(readonly payload: ObjectPlacementPayload) {}

  get label(): string {
    return `Place object (${this.payload.placement.tileX}, ${this.payload.placement.tileY})`
  }

  apply(scene: Scene): void {
    if (scene instanceof MapScene) addPlacement(scene, this.payload.placement)
  }

  revert(scene: Scene): void {
    if (scene instanceof MapScene) removePlacement(scene, this.payload.placement.id)
  }
}

/**
 * Remove an object from the map: drop the placement + despawn its entity.
 * Invertible — `revert` re-adds + re-spawns the captured placement.
 */
export class RemoveObjectCommand implements Command<ObjectPlacementPayload> {
  static readonly KIND = 'object.remove'
  readonly kind = RemoveObjectCommand.KIND

  constructor(readonly payload: ObjectPlacementPayload) {}

  get label(): string {
    return `Remove object "${this.payload.placement.id}"`
  }

  apply(scene: Scene): void {
    if (scene instanceof MapScene) removePlacement(scene, this.payload.placement.id)
  }

  revert(scene: Scene): void {
    if (scene instanceof MapScene) addPlacement(scene, this.payload.placement)
  }
}
