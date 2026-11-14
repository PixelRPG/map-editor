/**
 * The touch canvas cannot be proved by a screenshot: the headless
 * harness has no finger to put on it. These tests are the proof instead
 * — they pin the arithmetic that `pinch-zoom.ts` feeds straight into
 * the camera.
 */

import { describe, expect, it } from '@gjsify/unit'

import {
  beginTwoFinger,
  snapZoomToWholePixel,
  stepTwoFinger,
  type ZoomRange,
  wholePixelZoomLevels,
} from './touch-gesture.ts'

const RANGE: ZoomRange = { min: 0.1, max: 8 }

export default async () => {
  await describe('stepTwoFinger', async () => {
    await it('scales against the zoom the gesture started from, not the live one', async () => {
      const state = beginTwoFinger(2, 100, 100)
      // GTK reports scale cumulatively since `begin`, so a steady 1.5
      // must settle at 3 and not ratchet 3, 4.5, 6.75 …
      const first = stepTwoFinger(state, 1.5, 100, 100, RANGE)
      const second = stepTwoFinger(first.state, 1.5, 100, 100, RANGE)
      expect(first.zoom).toBe(3)
      expect(second.zoom).toBe(3)
    })

    await it('anchors the scale on the finger midpoint', async () => {
      const step = stepTwoFinger(beginTwoFinger(1, 10, 20), 2, 40, 60, RANGE)
      expect(step.anchorX).toBe(40)
      expect(step.anchorY).toBe(60)
    })

    await it('pans by how far the midpoint travelled since the last update', async () => {
      const state = beginTwoFinger(1, 100, 100)
      const first = stepTwoFinger(state, 1, 130, 90, RANGE)
      expect(first.panX).toBe(30)
      expect(first.panY).toBe(-10)
      // Deltas are per step, never cumulative: a second update at the
      // same place must not re-apply the first move.
      const second = stepTwoFinger(first.state, 1, 130, 90, RANGE)
      expect(second.panX).toBe(0)
      expect(second.panY).toBe(0)
    })

    await it('pans with two fingers even when the scale never changes', async () => {
      const step = stepTwoFinger(beginTwoFinger(1, 0, 0), 1, 50, 50, RANGE)
      expect(step.zoom).toBe(1)
      expect(step.panX).toBe(50)
      expect(step.panY).toBe(50)
    })

    await it('clamps the zoom to the editor range', async () => {
      expect(stepTwoFinger(beginTwoFinger(4, 0, 0), 8, 0, 0, RANGE).zoom).toBe(RANGE.max)
      expect(stepTwoFinger(beginTwoFinger(0.2, 0, 0), 0.01, 0, 0, RANGE).zoom).toBe(RANGE.min)
    })

    await it('survives the scale GTK reports before the fingers settle', async () => {
      for (const scale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(stepTwoFinger(beginTwoFinger(2, 0, 0), scale, 0, 0, RANGE).zoom).toBe(2)
      }
    })
  })

  await describe('wholePixelZoomLevels', async () => {
    await it('offers the integers up and the reciprocals down', async () => {
      // 1/3 belongs here as much as 1/2 does: three source pixels per
      // screen pixel is still a whole ratio.
      expect(wholePixelZoomLevels({ min: 0.25, max: 4 }).join(' ')).toBe([0.25, 1 / 3, 0.5, 1, 2, 3, 4].join(' '))
    })

    await it('stays inside the range', async () => {
      for (const level of wholePixelZoomLevels(RANGE)) {
        expect(level >= RANGE.min && level <= RANGE.max).toBe(true)
      }
    })

    await it('never comes back empty, however narrow the range', async () => {
      expect(wholePixelZoomLevels({ min: 1, max: 1 }).join(' ')).toBe('1')
    })
  })

  await describe('snapZoomToWholePixel', async () => {
    await it('leaves a zoom that is already whole-pixel alone', async () => {
      for (const zoom of [0.5, 1, 2, 3, 8]) {
        expect(snapZoomToWholePixel(zoom, RANGE)).toBe(zoom)
      }
    })

    await it('springs a pinched zoom to the nearest level', async () => {
      expect(snapZoomToWholePixel(1.1, RANGE)).toBe(1)
      expect(snapZoomToWholePixel(1.9, RANGE)).toBe(2)
      expect(snapZoomToWholePixel(0.45, RANGE)).toBe(0.5)
      expect(snapZoomToWholePixel(0.27, RANGE)).toBe(1 / 4)
    })

    await it('measures nearness multiplicatively', async () => {
      // 1.5 is the geometric midpoint of 1 and 2 at sqrt(2) ~ 1.414, so
      // anything above that belongs to 2 — linear distance would tie.
      expect(snapZoomToWholePixel(1.5, RANGE)).toBe(2)
      expect(snapZoomToWholePixel(1.41, RANGE)).toBe(1)
      // 0.75 is further from 1 than it looks: it is 1.5x of 0.5.
      expect(snapZoomToWholePixel(0.75, RANGE)).toBe(1)
      expect(snapZoomToWholePixel(0.69, RANGE)).toBe(0.5)
    })

    await it('clamps before it snaps', async () => {
      expect(snapZoomToWholePixel(100, RANGE)).toBe(RANGE.max)
      expect(snapZoomToWholePixel(0.001, RANGE)).toBe(0.1)
    })

    await it('falls back to a usable zoom for nonsense input', async () => {
      for (const zoom of [0, -2, Number.NaN]) {
        expect(snapZoomToWholePixel(zoom, RANGE)).toBe(1)
      }
    })
  })
}
