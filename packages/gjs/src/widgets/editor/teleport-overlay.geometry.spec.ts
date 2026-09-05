import { describe, expect, it } from '@gjsify/unit'

import {
  arrowheadPoints,
  controlPoint,
  CURVE_OFFSET_FACTOR,
  CURVE_OFFSET_MAX,
  type OverlayPoint,
  teleportEndpoint,
} from './teleport-overlay.geometry.ts'

const scene = { x: 100, y: 200, tilePx: 8 }

/** Rounded compare — the geometry is float math, not exact decimals. */
function near(point: OverlayPoint, x: number, y: number, digits = 6): void {
  expect(Number(point.x.toFixed(digits))).toBe(Number(x.toFixed(digits)))
  expect(Number(point.y.toFixed(digits))).toBe(Number(y.toFixed(digits)))
}

export default async () => {
  await describe('teleport-overlay.geometry', async () => {
    await describe('teleportEndpoint', async () => {
      await it('lands on the CENTRE of the tile, not its corner', async () => {
        near(teleportEndpoint(scene, 0, 0, 1, 0), 104, 204)
      })

      await it('steps one tile per index', async () => {
        near(teleportEndpoint(scene, 3, 2, 1, 0), 100 + 3.5 * 8, 200 + 2.5 * 8)
      })

      await it('offsets past the card title bar', async () => {
        near(teleportEndpoint(scene, 0, 0, 1, 22), 104, 226)
      })

      await it('scales the scene position but NOT the title bar', async () => {
        // Documents today's behaviour: `scale` is always 1 from
        // `AtlasCanvas`, so the unscaled title offset never shows. A
        // scaled overlay would need the offset scaled too.
        near(teleportEndpoint(scene, 0, 0, 2, 22), 208, 430)
      })

      await it('handles a zero-size tile without NaN', async () => {
        near(teleportEndpoint({ x: 10, y: 20, tilePx: 0 }, 5, 5, 1, 0), 10, 20)
      })
    })

    await describe('controlPoint', async () => {
      await it('bows perpendicular to a horizontal segment', async () => {
        // Length 100 → offset 25, perpendicular of (+x) is (+y).
        near(controlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }), 50, 25)
      })

      await it('bows perpendicular to a vertical segment', async () => {
        // Perpendicular of (+y) is (-x).
        near(controlPoint({ x: 0, y: 0 }, { x: 0, y: 100 }), -25, 50)
      })

      await it('caps the bow on a long segment', async () => {
        const control = controlPoint({ x: 0, y: 0 }, { x: 1000, y: 0 })
        expect(control.y).toBe(CURVE_OFFSET_MAX)
      })

      await it('uses the proportional bow just below the cap', async () => {
        const length = CURVE_OFFSET_MAX / CURVE_OFFSET_FACTOR - 4
        const control = controlPoint({ x: 0, y: 0 }, { x: length, y: 0 })
        expect(control.y).toBe(length * CURVE_OFFSET_FACTOR)
        expect(control.y < CURVE_OFFSET_MAX).toBe(true)
      })

      await it('switches to the cap exactly at the crossover length', async () => {
        const length = CURVE_OFFSET_MAX / CURVE_OFFSET_FACTOR
        expect(controlPoint({ x: 0, y: 0 }, { x: length, y: 0 }).y).toBe(CURVE_OFFSET_MAX)
      })

      await it('mirrors when the endpoints swap (the curve bows the other way)', async () => {
        const forward = controlPoint({ x: 0, y: 0 }, { x: 100, y: 0 })
        const backward = controlPoint({ x: 100, y: 0 }, { x: 0, y: 0 })
        expect(forward.x).toBe(backward.x)
        expect(forward.y).toBe(-backward.y)
      })

      await it('stays finite for coincident endpoints (a self-teleport)', async () => {
        const control = controlPoint({ x: 7, y: 9 }, { x: 7, y: 9 })
        expect(Number.isFinite(control.x)).toBe(true)
        expect(Number.isFinite(control.y)).toBe(true)
        near(control, 7, 9)
      })
    })

    await describe('arrowheadPoints', async () => {
      await it('puts the tip first and the base behind it', async () => {
        const [tip, left, right] = arrowheadPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)
        near(tip, 100, 0)
        near(left, 90, 6)
        near(right, 90, -6)
      })

      await it('points along the incoming direction, not the axes', async () => {
        const [, left, right] = arrowheadPoints({ x: 0, y: 0 }, { x: 0, y: 50 }, 10)
        // Direction (+y): base sits 10 px back at y = 40, corners on ±x.
        near(left, -6, 40)
        near(right, 6, 40)
      })

      await it('keeps the base perpendicular to the tip direction', async () => {
        const [tip, left, right] = arrowheadPoints({ x: 0, y: 0 }, { x: 30, y: 40 }, 10)
        const baseVectorX = right.x - left.x
        const baseVectorY = right.y - left.y
        const dirX = tip.x - 0
        const dirY = tip.y - 0
        // Dot product of the base edge with the direction must vanish.
        expect(Math.abs(baseVectorX * dirX + baseVectorY * dirY) < 1e-9).toBe(true)
      })

      await it('makes the base 1.2 x the arrow length', async () => {
        const [, left, right] = arrowheadPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)
        expect(Number(Math.hypot(right.x - left.x, right.y - left.y).toFixed(6))).toBe(12)
      })

      await it('collapses to a point for coincident from / tip instead of NaN', async () => {
        const points = arrowheadPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)
        for (const point of points) {
          expect(Number.isFinite(point.x)).toBe(true)
          expect(Number.isFinite(point.y)).toBe(true)
        }
      })

      await it('degenerates to the tip at size 0', async () => {
        const [tip, left, right] = arrowheadPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)
        near(tip, 10, 0)
        near(left, 10, 0)
        near(right, 10, 0)
      })
    })
  })
}
