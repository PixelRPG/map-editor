/**
 * Pure camera-zoom math used by `EngineController.stepZoom` (button/key
 * zoom) and its `onCameraZoomChanged` dead-band (OSD-label de-spam).
 *
 * Pinned independently of the gi-bound engine widget. Every expected
 * value here is the actual output of the original inline expressions, so
 * the spec is a behavior-preservation guard for the extraction — including
 * the deliberately-lossy step quantisation and the `>= deadBand` boundary
 * (the negation of the source's `< 0.01` suppress condition).
 */

import { describe, expect, it } from '@gjsify/unit'

import { ZOOM_MAX, ZOOM_MIN, calculateNextZoom, shouldReportZoomChange } from './zoom-math.ts'

export default async () => {
  await describe('calculateNextZoom', async () => {
    await it('steps up by delta, rounded to one decimal', async () => {
      expect(calculateNextZoom(1, 0.2)).toBe(1.2)
      expect(calculateNextZoom(2, 0.2)).toBe(2.2)
    })

    await it('quantises to tenths (rounds independently each step)', async () => {
      expect(calculateNextZoom(1.05, 0.001)).toBe(1.1)
      expect(calculateNextZoom(1.234, 0.567)).toBe(1.8)
      // 0.05 + 0.1 rounds to 0.2 — repeated steps != initial + Σdeltas.
      expect(calculateNextZoom(0.05, 0.1)).toBe(0.2)
    })

    await it('clamps to the max bound', async () => {
      expect(calculateNextZoom(3.9, 0.2)).toBe(ZOOM_MAX)
      expect(calculateNextZoom(3.95, 0.1)).toBe(ZOOM_MAX)
      expect(calculateNextZoom(10, 0)).toBe(ZOOM_MAX)
    })

    await it('clamps to the min bound', async () => {
      expect(calculateNextZoom(0.1, -0.05)).toBe(ZOOM_MIN)
      expect(calculateNextZoom(0.2, -1)).toBe(ZOOM_MIN)
      expect(calculateNextZoom(0, 0)).toBe(ZOOM_MIN)
    })

    await it('is a no-op for a zero delta on an in-range value', async () => {
      expect(calculateNextZoom(1, 0)).toBe(1)
    })
  })

  await describe('shouldReportZoomChange', async () => {
    await it('suppresses changes below the dead-band', async () => {
      expect(shouldReportZoomChange(1.005, 1.0)).toBe(false)
      expect(shouldReportZoomChange(1.009, 1.0)).toBe(false)
      expect(shouldReportZoomChange(0.995, 1.0)).toBe(false)
    })

    await it('reports changes at or above the dead-band', async () => {
      expect(shouldReportZoomChange(1.015, 1.0)).toBe(true)
      expect(shouldReportZoomChange(1.011, 1.0)).toBe(true)
      expect(shouldReportZoomChange(2.0, 1.0)).toBe(true)
    })

    await it('reports a change of exactly the dead-band edge', async () => {
      // Mirrors the source `< 0.01` suppress condition negated: exactly
      // 0.01 is NOT suppressed, so it must report.
      expect(shouldReportZoomChange(1.01, 1.0)).toBe(true)
    })

    await it('suppresses an unchanged value', async () => {
      expect(shouldReportZoomChange(1.0, 1.0)).toBe(false)
    })

    await it('honours a custom dead-band', async () => {
      expect(shouldReportZoomChange(1.04, 1.0, 0.05)).toBe(false)
      expect(shouldReportZoomChange(1.06, 1.0, 0.05)).toBe(true)
    })
  })
}
