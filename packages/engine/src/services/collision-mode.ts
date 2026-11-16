import type { Scene } from 'excalibur'
import { PlaneTileMap } from '../resource/plane-tile-map.ts'

/**
 * The one switch for collision in a scene.
 *
 * The editor never simulates, and collision is the single most
 * expensive thing a map with thousands of blocking tiles does per
 * frame (`docs/design/excalibur-1.md` §2.1: update 58 ms → 1.4 ms
 * without it). So a scene owns collision only while something needs
 * it. Two things move together and must never disagree:
 *
 * - the scene's physics world (`CollisionSystem` early-outs when off), and
 * - every {@link PlaneTileMap}, which builds its collider boxes only
 *   while on and releases them when switched off.
 *
 * WHEN collision is wanted is decided by the caller. Today
 * `applyRuntimeMode` ties it to the run state; an "edit while the game
 * runs" mode changes that one line, not the mechanism here.
 */

/** Whether `scene`'s physics world is currently simulating. */
export function isCollisionActive(scene: Scene): boolean {
  return scene.physics.config.enabled
}

/**
 * Turn collision on or off for the whole scene. Idempotent. Turning it
 * on builds the tilemap boxes on the next update (before the collision
 * system of that frame); turning it off drops them.
 */
export function setCollisionActive(scene: Scene, active: boolean): void {
  if (scene.physics.config.enabled !== active) scene.physics.config.enabled = active
  for (const tileMap of scene.tileMaps) {
    if (tileMap instanceof PlaneTileMap) tileMap.setCollisionActive(active)
  }
}
