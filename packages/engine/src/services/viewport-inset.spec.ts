/**
 * The camera's offset for chrome that covers part of the canvas.
 *
 * The sign is the whole test: getting it backwards hides the focused
 * tile *further* behind the sheet, which looks like the focus failing
 * rather than like an arithmetic slip.
 */

import { describe, expect, it } from '@gjsify/unit'

import {
  EMPTY_VIEWPORT_INSET,
  insetCameraTarget,
  normalizeViewportInset,
  type ViewportInset,
} from './viewport-inset.ts'

export default async () => {
  await describe('normalizeViewportInset', async () => {
    await it('keeps a positive inset', async () => {
      expect(normalizeViewportInset({ bottom: 256 }).bottom).toBe(256)
    })

    await it('treats every non-value as no inset', async () => {
      for (const input of [null, undefined, {}, { bottom: 0 }, { bottom: -10 }, { bottom: Number.NaN }]) {
        expect(normalizeViewportInset(input as Partial<ViewportInset>).bottom).toBe(0)
      }
    })
  })

  await describe('insetCameraTarget', async () => {
    await it('moves the camera down so the point rises above the chrome', async () => {
      const target = insetCameraTarget({ x: 100, y: 200 }, { bottom: 256 }, 1)
      expect(target.y).toBe(200 + 128)
    })

    await it('leaves the horizontal axis alone', async () => {
      expect(insetCameraTarget({ x: 100, y: 200 }, { bottom: 256 }, 1).x).toBe(100)
    })

    await it('measures the inset in screen px, not world units', async () => {
      // At 4× zoom, 256 screen px is 64 world units — half of that is 32.
      expect(insetCameraTarget({ x: 0, y: 0 }, { bottom: 256 }, 4).y).toBe(32)
    })

    await it('returns the point unchanged without an inset', async () => {
      const target = insetCameraTarget({ x: 7, y: 9 }, EMPTY_VIEWPORT_INSET, 2)
      expect(target.x).toBe(7)
      expect(target.y).toBe(9)
    })

    await it('falls back to 1× for a nonsense zoom', async () => {
      for (const zoom of [0, -2, Number.NaN]) {
        expect(insetCameraTarget({ x: 0, y: 0 }, { bottom: 10 }, zoom).y).toBe(5)
      }
    })
  })
}
