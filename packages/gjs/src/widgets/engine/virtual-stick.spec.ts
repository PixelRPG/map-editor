/**
 * The virtual joystick's pure decisions. Touch cannot be injected into
 * the headless harness, so this is the only place the stick's contract
 * can be proven — in particular the one that matters most: it produces
 * exactly the eight vectors the keyboard produces, so a thumb and an
 * arrow key move the hero at the same speed.
 */

import { describe, expect, it } from '@gjsify/unit'

import {
  clampStickOrigin,
  isInStickRegion,
  STICK_BASE_PX,
  STICK_DEAD_ZONE_PX,
  STICK_MAX_TRAVEL_PX,
  stickKnobOffset,
  stickVector,
  touchIntent,
} from './virtual-stick.ts'

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9

export default async () => {
  await describe('isInStickRegion', async () => {
    await it('accepts the bottom-left corner', async () => {
      expect(isInStickRegion(10, 590, 1000, 600)).toBe(true)
    })

    await it('rejects the top-left and bottom-right corners', async () => {
      // Top-left is where the map is; bottom-right is the action
      // button's corner. Neither may summon a stick.
      expect(isInStickRegion(10, 10, 1000, 600)).toBe(false)
      expect(isInStickRegion(990, 590, 1000, 600)).toBe(false)
    })

    await it('scales with the canvas instead of using a fixed box', async () => {
      // A thumb's reach grows with the device, so the region is a
      // fraction: the same relative point must answer the same on a
      // 360 px phone and on a canvas twice its size.
      expect(isInStickRegion(100, 500, 360, 640)).toBe(true)
      for (const [x, y] of [
        [100, 500],
        [100, 300],
        [300, 500],
      ]) {
        expect(isInStickRegion(x, y, 360, 640)).toBe(isInStickRegion(x * 2, y * 2, 720, 1280))
      }
    })

    await it('rejects everything on a zero-sized canvas', async () => {
      // Before the first allocation GTK reports 0×0; a press then must
      // not be read as in-region at the origin.
      expect(isInStickRegion(0, 0, 0, 0)).toBe(false)
    })
  })

  await describe('clampStickOrigin', async () => {
    await it('keeps the base fully on screen', async () => {
      const radius = STICK_BASE_PX / 2
      const clamped = clampStickOrigin({ x: 2, y: 598 }, 1000, 600)
      expect(clamped.x).toBe(radius)
      expect(clamped.y).toBe(600 - radius)
    })

    await it('leaves a comfortable press where it is', async () => {
      const clamped = clampStickOrigin({ x: 160, y: 480 }, 1000, 600)
      expect(clamped.x).toBe(160)
      expect(clamped.y).toBe(480)
    })

    await it('centres on a canvas too small to hold the base', async () => {
      const clamped = clampStickOrigin({ x: 5, y: 5 }, 60, 40)
      expect(clamped.x).toBe(30)
      expect(clamped.y).toBe(20)
    })
  })

  await describe('stickKnobOffset', async () => {
    await it('follows the thumb inside the travel limit', async () => {
      const offset = stickKnobOffset({ x: 100, y: 100 }, { x: 120, y: 90 })
      expect(offset.x).toBe(20)
      expect(offset.y).toBe(-10)
    })

    await it('caps travel on a circle, not per axis', async () => {
      // A diagonal clamped per axis would reach sqrt(2)x further and
      // draw the knob outside the round base.
      const offset = stickKnobOffset({ x: 0, y: 0 }, { x: 400, y: 400 })
      expect(close(Math.hypot(offset.x, offset.y), STICK_MAX_TRAVEL_PX)).toBe(true)
    })

    await it('survives a thumb exactly on the centre', async () => {
      const offset = stickKnobOffset({ x: 50, y: 50 }, { x: 50, y: 50 })
      expect(offset.x).toBe(0)
      expect(offset.y).toBe(0)
    })
  })

  await describe('stickVector', async () => {
    await it('reads as centred inside the dead zone', async () => {
      const vector = stickVector({ x: STICK_DEAD_ZONE_PX - 1, y: 0 })
      expect(vector.moveX).toBe(0)
      expect(vector.moveY).toBe(0)
    })

    await it('produces clean cardinals', async () => {
      expect(stickVector({ x: 40, y: 0 }).moveX).toBe(1)
      expect(stickVector({ x: 40, y: 0 }).moveY).toBe(0)
      expect(stickVector({ x: -40, y: 0 }).moveX).toBe(-1)
      expect(stickVector({ x: 0, y: -40 }).moveY).toBe(-1)
      expect(stickVector({ x: 0, y: 40 }).moveY).toBe(1)
    })

    await it('pre-scales diagonals the way the keyboard does', async () => {
      // `readMovementInput` scales a two-key diagonal by 1/sqrt(2); the
      // stick must match it exactly or touch moves faster than keys.
      const vector = stickVector({ x: 30, y: 30 })
      expect(close(vector.moveX, 1 / Math.SQRT2)).toBe(true)
      expect(close(vector.moveY, 1 / Math.SQRT2)).toBe(true)
    })

    await it('never exceeds unit length in any direction', async () => {
      // The property the quantisation exists to guarantee: one speed,
      // whichever way the thumb points.
      for (let degrees = 0; degrees < 360; degrees += 3) {
        const radians = (degrees * Math.PI) / 180
        const vector = stickVector({ x: Math.cos(radians) * 40, y: Math.sin(radians) * 40 })
        expect(Math.hypot(vector.moveX, vector.moveY) <= 1 + 1e-9).toBe(true)
      }
    })

    await it('quantises every angle to one of the eight keyboard vectors', async () => {
      const diagonal = 1 / Math.SQRT2
      const allowed = [0, 1, -1, diagonal, -diagonal]
      for (let degrees = 0; degrees < 360; degrees += 1) {
        const radians = (degrees * Math.PI) / 180
        const vector = stickVector({ x: Math.cos(radians) * 40, y: Math.sin(radians) * 40 })
        expect(allowed.some((value) => close(value, vector.moveX))).toBe(true)
        expect(allowed.some((value) => close(value, vector.moveY))).toBe(true)
      }
    })
  })

  await describe('touchIntent', async () => {
    await it('is inactive with no drag and no button', async () => {
      const intent = touchIntent(null, { action: false, attack: false })
      expect(intent.active).toBe(false)
      expect(intent.moveX).toBe(0)
    })

    await it('is active for a button alone', async () => {
      // A player who only taps A is still a live touch producer.
      const intent = touchIntent(null, { action: true, attack: false })
      expect(intent.active).toBe(true)
      expect(intent.actionHeld).toBe(true)
      expect(intent.moveY).toBe(0)
    })

    await it('carries the stick vector while a thumb is on it', async () => {
      const intent = touchIntent({ origin: { x: 0, y: 0 }, knob: { x: 0, y: 40 } }, { action: false, attack: true })
      expect(intent.active).toBe(true)
      expect(intent.moveY).toBe(1)
      expect(intent.attackHeld).toBe(true)
    })
  })
}
