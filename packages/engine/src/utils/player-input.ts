import { Keys } from 'excalibur'
import type { CharacterAnimationRole, Facing } from '../types/data/index.ts'

/** Excalibur's input.keyboard surface narrowed to what we actually need. */
export interface KeyboardLike {
  isHeld: (key: Keys) => boolean
  /** Pressed since the last frame — catches a tap that was released before the next poll. */
  wasPressed?: (key: Keys) => boolean
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

/** A confirm tap this frame, even one already released (`wasPressed`). */
export function isConfirmTapped(kb: KeyboardLike): boolean {
  return isActionPressed(kb) || !!kb.wasPressed?.(Keys.Space) || !!kb.wasPressed?.(Keys.Enter)
}

/**
 * True when the held attack keys (X / J) form a "press" this frame.
 *
 * Kept off Space and Enter deliberately: those are the action button, and
 * a hero who swings a sword every time they try to read a sign is the
 * bug this separation exists to prevent. X is the arrow-keys pairing, J
 * the WASD one.
 */
export function isAttackPressed(kb: KeyboardLike): boolean {
  return kb.isHeld(Keys.X) || kb.isHeld(Keys.J)
}

/**
 * One input producer's intent for a frame — the shape
 * `InputSourceComponent` carries, without being tied to a component
 * instance so it can be reasoned about (and tested) as a value.
 */
export interface InputIntent {
  moveX: number
  moveY: number
  actionHeld: boolean
  attackHeld: boolean
}

/**
 * Combine the keyboard's intent with an on-screen touch control's.
 *
 * Movement takes the touch vector whenever it is non-neutral and falls
 * back to the keyboard otherwise, rather than summing them: two
 * producers pushing opposite directions would cancel to a standstill,
 * and summing a stick already at full travel with a held arrow key
 * would move the hero faster than either device alone can. "Whoever is
 * actually steering wins, and the thumb on the glass is the more
 * deliberate of the two" is both predictable and speed-preserving.
 *
 * The buttons OR together because they are momentary and nothing about
 * holding both is contradictory — a player who taps the on-screen A
 * while resting a hand on Space means to act once, not to fight the
 * keyboard. Edge detection stays with the consumers, which see one
 * combined held state and so cannot double-fire.
 *
 * Pure, so the merge rule is proven in `player-input.spec.ts` instead
 * of in a touch sequence no headless harness can inject.
 */
export function mergeInputIntents(keyboard: InputIntent, touch: InputIntent | null): InputIntent {
  const touchMoving = touch !== null && (touch.moveX !== 0 || touch.moveY !== 0)
  return {
    moveX: touchMoving ? touch.moveX : keyboard.moveX,
    moveY: touchMoving ? touch.moveY : keyboard.moveY,
    actionHeld: keyboard.actionHeld || (touch?.actionHeld ?? false),
    attackHeld: keyboard.attackHeld || (touch?.attackHeld ?? false),
  }
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
