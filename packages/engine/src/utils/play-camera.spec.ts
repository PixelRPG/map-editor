import { describe, expect, it } from '@gjsify/unit'

import { clampCameraFocus, PLAY_MIN_TILES, playZoom } from './play-camera.ts'

const MAP = { width: 640, height: 480 }
const BOUNDS = { min: 0.1, max: 8 }
const TILE = { width: 16, height: 16 }

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

  await describe('playZoom', async () => {
    const desktop = { width: 1280, height: 800 }
    const phone = { width: 360, height: 640 }

    await it('opens a big map at the tile budget on a desktop window', async () => {
      // 800 / (10 rows × 16 px) = 5 exactly; width would allow 5.33.
      const zoom = playZoom({ resolution: desktop, map: { width: 1600, height: 1280 }, tile: TILE, bounds: BOUNDS })
      expect(zoom).toBe(5)
    })

    await it('zooms further in so a map smaller than the budget fills the window', async () => {
      // A 10 × 8 interior: the tile budget would leave it floating in a
      // frame of void, so the whole-map-fits floor (6.25) wins instead.
      const zoom = playZoom({ resolution: desktop, map: { width: 160, height: 128 }, tile: TILE, bounds: BOUNDS })
      expect(zoom).toBe(6)
    })

    await it('keeps the promised tiles on a phone-sized window', async () => {
      // The budget here is 1.5, whose NEAREST level is 2 — and 2 shows
      // only 11 columns. Rounding down is what keeps the promise.
      const zoom = playZoom({ resolution: phone, map: MAP, tile: TILE, bounds: BOUNDS })
      expect(zoom).toBe(1)
    })

    await it('never shows fewer tiles than promised', async () => {
      for (const resolution of [desktop, phone, { width: 720, height: 540 }, { width: 1920, height: 1080 }]) {
        const zoom = playZoom({ resolution, map: { width: 3200, height: 3200 }, tile: TILE, bounds: BOUNDS })
        expect(resolution.width / (zoom * TILE.width) >= PLAY_MIN_TILES.columns).toBe(true)
        expect(resolution.height / (zoom * TILE.height) >= PLAY_MIN_TILES.rows).toBe(true)
      }
    })

    await it('scales the budget with the tile size', async () => {
      // 32 px tiles want twice the room, so half the magnification.
      const zoom = playZoom({
        resolution: desktop,
        map: { width: 3200, height: 3200 },
        tile: { width: 32, height: 32 },
        bounds: BOUNDS,
      })
      expect(zoom).toBe(2)
    })

    await it('ignores a map whose size is not known yet', async () => {
      const zoom = playZoom({ resolution: desktop, map: { width: 0, height: 0 }, tile: TILE, bounds: BOUNDS })
      expect(zoom).toBe(5)
    })

    await it('falls back to 1 when the window has not been sized yet', async () => {
      const zoom = playZoom({ resolution: { width: 0, height: 0 }, map: MAP, tile: TILE, bounds: BOUNDS })
      expect(zoom).toBe(1)
    })

    await it('falls back to 1 on a garbage tile size', async () => {
      const zoom = playZoom({ resolution: desktop, map: MAP, tile: { width: Number.NaN, height: 16 }, bounds: BOUNDS })
      expect(zoom).toBe(1)
    })

    await it('stays inside the zoom bounds at both ends', async () => {
      const tooBig = playZoom({
        resolution: { width: 40000, height: 40000 },
        map: { width: 80000, height: 80000 },
        tile: TILE,
        bounds: BOUNDS,
      })
      expect(tooBig).toBe(BOUNDS.max)

      const tooSmall = playZoom({
        resolution: { width: 24, height: 16 },
        map: MAP,
        tile: TILE,
        bounds: BOUNDS,
      })
      expect(tooSmall).toBe(BOUNDS.min)
    })
  })
}
