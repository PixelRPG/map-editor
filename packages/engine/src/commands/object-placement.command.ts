import type { Scene } from 'excalibur'
import { MapScene } from '../scenes/map.scene.ts'
import type { ObjectPlacement } from '../types/data/index.ts'
import type { Command } from './types.ts'

/** Payload of {@link PlaceObjectCommand} / {@link RemoveObjectCommand}. */
export interface ObjectPlacementPayload {
  /** The full placement (stable id) — carried whole so revert can restore it. */
  placement: ObjectPlacement
  /**
   * The placement this one REPLACED (same id), captured by
   * {@link PlaceObjectCommand.apply} when it overwrites an existing
   * entry — so revert restores the previous placement instead of
   * deleting it. Absent for a plain place onto an empty id. Stamped
   * before `COMMAND_EXECUTED` fires, so the wire payload carries it
   * and a remote revert converges to the same restored state.
   */
  replaced?: ObjectPlacement
}

/** Add the placement to `mapData.objectPlacements`, replacing one with the same id. */
function addPlacement(scene: MapScene, placement: ObjectPlacement): void {
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
 * `revert` removes it, or — when the place REPLACED an existing
 * same-id placement (the update path) — restores the captured
 * previous one. Like every {@link Command} the payload is pure,
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
    if (!(scene instanceof MapScene)) return
    // Same-id replace (the "update a placement" path): capture what we
    // overwrite so revert restores it. Re-applies (redo / replayed
    // duplicate delivery) keep the FIRST capture — overwriting it with
    // our own placement would make a later revert a no-op.
    const existing = scene.mapResource.mapData?.objectPlacements?.find((p) => p.id === this.payload.placement.id)
    if (existing && this.payload.replaced === undefined && !placementsEqual(existing, this.payload.placement)) {
      this.payload.replaced = existing
    }
    addPlacement(scene, this.payload.placement)
  }

  revert(scene: Scene): void {
    if (!(scene instanceof MapScene)) return
    if (this.payload.replaced) addPlacement(scene, this.payload.replaced)
    else removePlacement(scene, this.payload.placement.id)
  }
}

/** Structural equality via JSON — placements are small, pure data. */
function placementsEqual(a: ObjectPlacement, b: ObjectPlacement): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
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
