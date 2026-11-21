/**
 * Pure math behind `EngineController`'s `onCameraZoomChanged` dead-band (OSD-label de-spam).
 *
 * Pinned independently of the gi-bound engine widget. Every expected
 * value here is the actual output of the original inline expressions, so
 * the spec is a behavior-preservation guard for the extraction — including
 * the deliberately-lossy step quantisation and the `>= deadBand` boundary
 * (the negation of the source's `< 0.01` suppress condition).
 */

import { describe, expect, it } from '@gjsify/unit'

import { shouldReportZoomChange } from './zoom-math.ts'

export default async () => {
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
