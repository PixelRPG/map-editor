import { describe, expect, it } from '@gjsify/unit'

import { snapZoomToWholePixel, wholePixelZoomLevels, type ZoomRange } from './zoom.ts'

const RANGE: ZoomRange = { min: 0.1, max: 8 }

export default async () => {
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
