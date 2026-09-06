import type { Actor, Entity, Scene } from 'excalibur'
import { CombatSessionComponent } from '../components/combat-session.component.ts'
import { InvulnerableUntilComponent } from '../components/invulnerable-until.component.ts'
import { PlayerComponent } from '../components/player-actor.component.ts'
import type { Facing } from '../types/data/index.ts'
import { SessionState } from './session-state.ts'

/**
 * Pure helpers shared by `combat-action`'s systems.
 *
 * Exported separately from the systems so the geometry can be unit-tested
 * without spinning up Excalibur — the same split `player-input.ts` makes
 * for `PlayerSystem`.
 */

/** An axis-aligned box in world pixels. */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** The unit vector a facing points along, in screen coordinates (y grows down). */
export function facingVector(facing: Facing): { x: number; y: number } {
  switch (facing) {
    case 'up':
      return { x: 0, y: -1 }
    case 'down':
      return { x: 0, y: 1 }
    case 'left':
      return { x: -1, y: 0 }
    default:
      return { x: 1, y: 0 }
  }
}

/**
 * The box a swing sweeps: a `reachTiles`-long rectangle starting at the
 * attacker's edge and extending along `facing`, one tile wide across.
 *
 * Starting at the edge rather than at the centre is what stops a swing
 * from hitting something standing *behind* the attacker, and the
 * across-axis width is a full tile so a slime half a tile off the axis
 * still gets clipped — a sword that only connects on perfect alignment
 * reads as broken long before it reads as precise.
 */
export function swingBox(
  attackerX: number,
  attackerY: number,
  facing: Facing,
  reachTiles: number,
  tileWidth: number,
  tileHeight: number,
): Box {
  const dir = facingVector(facing)
  const alongX = dir.x !== 0
  const reachPx = reachTiles * (alongX ? tileWidth : tileHeight)
  const halfDepth = (alongX ? tileWidth : tileHeight) / 2
  const halfWidth = (alongX ? tileHeight : tileWidth) / 2

  const nearX = attackerX + dir.x * halfDepth
  const nearY = attackerY + dir.y * halfDepth
  const farX = nearX + dir.x * reachPx
  const farY = nearY + dir.y * reachPx

  return {
    left: Math.min(nearX, farX) - (alongX ? 0 : halfWidth),
    right: Math.max(nearX, farX) + (alongX ? 0 : halfWidth),
    top: Math.min(nearY, farY) - (alongX ? halfWidth : 0),
    bottom: Math.max(nearY, farY) + (alongX ? halfWidth : 0),
  }
}

/** Is the point inside the box (edges count as inside)? */
export function boxContains(box: Box, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
}

/**
 * The scene's combat session state, created on first use so every system
 * finds a record rather than having to distinguish "no combat yet" from
 * "no session at all" — the same up-front creation `FlagSystem` does for
 * the flag store.
 */
export function combatSession(scene: Scene): CombatSessionComponent {
  const existing = SessionState.get(scene, CombatSessionComponent)
  if (existing) return existing
  const created = new CombatSessionComponent()
  SessionState.set(scene, created)
  return created
}

/** True while the entity is inside its post-hit grace period. */
export function isInvulnerable(entity: Entity, nowMs: number): boolean {
  const until = entity.get(InvulnerableUntilComponent)
  return until !== undefined && until !== null && until.untilMs > nowMs
}

/** The player's actor in this scene, or `null` before it has spawned. */
export function findPlayerActor(scene: Scene): Actor | null {
  for (const entity of scene.entities) {
    if (entity.get(PlayerComponent)) return entity as Actor
  }
  return null
}
