import { Keys } from 'excalibur'
import type { CharacterAnimationRole, Facing } from '../types/data/index.ts'

/** Excalibur's input.keyboard surface narrowed to what we actually need. */
export interface KeyboardLike {
  isHeld: (key: Keys) => boolean
}

/**
 * Read held movement keys (arrows + WASD) and return a normalised
 * unit vector. Diagonals are scaled by `1/sqrt(2)` so going NE isn't
 * sqrt(2)× faster than going N.
 *
 * Pure — exported separately from {@link PlayerSystem} so it can be
 * unit-tested without spinning up Excalibur.
 */
export function readMovementInput(kb: KeyboardLike): { dx: number; dy: number } {
  let dx = 0
  let dy = 0
  if (kb.isHeld(Keys.Up) || kb.isHeld(Keys.W)) dy -= 1
  if (kb.isHeld(Keys.Down) || kb.isHeld(Keys.S)) dy += 1
  if (kb.isHeld(Keys.Left) || kb.isHeld(Keys.A)) dx -= 1
  if (kb.isHeld(Keys.Right) || kb.isHeld(Keys.D)) dx += 1
  if (dx !== 0 && dy !== 0) {
    const inv = 1 / Math.SQRT2
    dx *= inv
    dy *= inv
  }
  return { dx, dy }
}

/** True when the held action keys (Space / Enter) form a "press" this frame. */
export function isActionPressed(kb: KeyboardLike): boolean {
  return kb.isHeld(Keys.Space) || kb.isHeld(Keys.Enter)
}

/**
 * Pick a facing from an input vector. Prefers the dominant axis;
 * exact ties (perfect diagonal) keep the previous facing so the hero
 * doesn't flicker between two animations when the user holds two
 * keys exactly.
 */
export function pickFacing(dx: number, dy: number, previous: Facing): Facing {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax === 0 && ay === 0) return previous
  if (ay > ax) return dy < 0 ? 'up' : 'down'
  if (ax > ay) return dx < 0 ? 'left' : 'right'
  return previous
}

/** Idle vs walk role for a given facing + motion state. */
export function roleFromState(facing: Facing, moving: boolean): CharacterAnimationRole {
  return moving ? `walk-${facing}` : `idle-${facing}`
}
