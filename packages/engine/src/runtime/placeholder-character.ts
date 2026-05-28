import { Animation, AnimationStrategy, Color, Rectangle } from 'excalibur'
import type { CharacterAnimationRole } from '../types/data/index.ts'

/**
 * Procedural placeholder hero — colored squares with a soft bob on
 * walk animations. Used by {@link PlayerSystem} when the project has
 * no character configured as `isPlayer`.
 *
 * Pure code, zero assets. Mario-Maker "drop into play right now"
 * pattern: the playtest workflow shouldn't block on Cast setup.
 *
 * Size matches the standard tile (16×16). When the configured hero
 * later replaces the placeholder, that hero's sprite size takes over.
 */

const SIZE = 16

const IDLE_FILL = Color.fromHex('#5aaaff')
const WALK_FILL_A = Color.fromHex('#2c7be5')
const WALK_FILL_B = Color.fromHex('#1a5cb5')
const STROKE = Color.fromHex('#ffffffaa')

function rect(color: Color, padTop = 0): Rectangle {
  return new Rectangle({
    width: SIZE,
    height: SIZE - padTop,
    color,
    strokeColor: STROKE,
    lineWidth: 1,
  })
}

function idleAnim(): Animation {
  return new Animation({
    frames: [{ graphic: rect(IDLE_FILL), duration: 400 }],
    strategy: AnimationStrategy.Loop,
  })
}

function walkAnim(): Animation {
  return new Animation({
    frames: [
      { graphic: rect(WALK_FILL_A), duration: 120 },
      { graphic: rect(WALK_FILL_B, 2), duration: 120 },
    ],
    strategy: AnimationStrategy.Loop,
  })
}

/**
 * Build a fresh role-indexed animation map for the placeholder hero.
 * Cloned per call so callers don't share frame-cursor state.
 */
export function buildPlaceholderAnimations(): Record<CharacterAnimationRole, Animation> {
  return {
    'idle-up': idleAnim(),
    'idle-down': idleAnim(),
    'idle-left': idleAnim(),
    'idle-right': idleAnim(),
    'walk-up': walkAnim(),
    'walk-down': walkAnim(),
    'walk-left': walkAnim(),
    'walk-right': walkAnim(),
  }
}
