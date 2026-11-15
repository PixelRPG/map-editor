import { describe, expect, it } from '@gjsify/unit'

import { clampCameraFocus } from './play-camera.ts'

const MAP = { width: 640, height: 480 }

export default async () => {
  await describe('clampCameraFocus', async () => {
    await it('leaves a focus well inside the map untouched', async () => {
      const focus = clampCameraFocus({ x: 320, y: 240 }, MAP, { width: 400, height: 300 })
      expect(focus.x).toBe(320)
      expect(focus.y).toBe(240)
    })

    await it('pushes the view off the left and top edges back in', async () => {
      const focus = clampCameraFocus({ x: 10, y: 5 }, MAP, { width: 400, height: 300 })
      expect(focus.x).toBe(200)
      expect(focus.y).toBe(150)
    })

    await it('pushes the view off the right and bottom edges back in', async () => {
      const focus = clampCameraFocus({ x: 9000, y: 9000 }, MAP, { width: 400, height: 300 })
      expect(focus.x).toBe(440)
      expect(focus.y).toBe(330)
    })

    // The case excalibur's LimitCameraBoundsStrategy is missing: its
    // branches would answer 400/300 here — the view's own half-size —
    // which parks a small room against the top-left of the window.
    await it('centres a map smaller than the view on both axes', async () => {
      const focus = clampCameraFocus({ x: 0, y: 0 }, { width: 160, height: 128 }, { width: 800, height: 600 })
      expect(focus.x).toBe(80)
      expect(focus.y).toBe(64)
    })

    await it('centres on one axis while clamping the other', async () => {
      const focus = clampCameraFocus({ x: 0, y: 9000 }, { width: 160, height: 480 }, { width: 800, height: 300 })
      expect(focus.x).toBe(80)
      expect(focus.y).toBe(330)
    })

    await it('centres when the view is exactly the size of the map', async () => {
      const focus = clampCameraFocus({ x: 11, y: 11 }, MAP, MAP)
      expect(focus.x).toBe(320)
      expect(focus.y).toBe(240)
    })

    // A map that has not loaded reports zero columns; moving the camera
    // to the origin for it would be a visible jump on every Play.
    await it('leaves the focus alone when the map has no size yet', async () => {
      const focus = clampCameraFocus({ x: 123, y: 456 }, { width: 0, height: 0 }, { width: 800, height: 600 })
      expect(focus.x).toBe(123)
      expect(focus.y).toBe(456)
    })

    await it('leaves the focus alone when the view has no size yet', async () => {
      const focus = clampCameraFocus({ x: 123, y: 456 }, MAP, { width: 0, height: 0 })
      expect(focus.x).toBe(123)
      expect(focus.y).toBe(456)
    })

    await it('survives a non-finite focus', async () => {
      const focus = clampCameraFocus({ x: Number.NaN, y: 240 }, MAP, { width: 400, height: 300 })
      expect(Number.isNaN(focus.x)).toBe(true)
      expect(focus.y).toBe(240)
    })
  })
}
