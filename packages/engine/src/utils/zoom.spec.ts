import { describe, expect, it } from '@gjsify/unit'

import {
  fitMinZoom,
  snapZoomToWholePixel,
  stepZoom,
  wantsDotLod,
  wholePixelZoomLevels,
  type ZoomRange,
} from './zoom.ts'

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

  await describe('fitMinZoom', async () => {
    const fit = (mw: number, mh: number, vw: number, vh: number, margin = 0) =>
      fitMinZoom({ map: { width: mw, height: mh }, viewport: { width: vw, height: vh }, margin, floor: 0.1 })

    await it('fits the whole map: the tighter axis decides', async () => {
      expect(fit(4000, 2000, 1000, 1000)).toBe(0.25)
      expect(fit(2000, 4000, 1000, 1000)).toBe(0.25)
      expect(fit(4000, 4000, 2000, 500)).toBe(0.125)
    })

    await it('keeps the margin free on each side', async () => {
      expect(fit(1000, 1000, 500, 500, 0.1)).toBe(0.4)
    })

    await it('never exceeds 1: a small map may still be viewed 1:1', async () => {
      expect(fit(100, 100, 1920, 1200, 0.05)).toBe(1)
    })

    await it('answers the floor for an unusable viewport or map', async () => {
      expect(fit(1000, 1000, 0, 0)).toBe(0.1)
      expect(fit(1000, 1000, 800, 0)).toBe(0.1)
      expect(fit(0, 0, 800, 600)).toBe(0.1)
      expect(fit(Number.NaN, 10, 800, 600)).toBe(0.1)
    })

    await it('never goes below the floor, even for a huge map', async () => {
      expect(fit(1_000_000, 1_000_000, 800, 600)).toBe(0.1)
    })

    await it('treats a tiny viewport as small, not as unusable', async () => {
      expect(fit(1000, 1000, 50, 50)).toBe(0.1)
    })

    await it('clamps an absurd margin', async () => {
      expect(Math.abs(fit(1000, 1000, 1000, 1000, 5) - 0.2) < 1e-9).toBe(true)
      expect(fit(1000, 1000, 1000, 1000, Number.NaN)).toBe(1)
    })
  })

  await describe('stepZoom', async () => {
    await it('adds the delta and rounds to a tenth', async () => {
      expect(stepZoom(1, 0.2, RANGE)).toBe(1.2)
      expect(stepZoom(1.05, 0.001, RANGE)).toBe(1.1)
    })

    await it('clamps to both ends', async () => {
      expect(stepZoom(7.9, 0.2, RANGE)).toBe(RANGE.max)
      expect(stepZoom(0.1, -0.2, RANGE)).toBe(RANGE.min)
    })

    await it('reaches a fractional minimum exactly', async () => {
      expect(stepZoom(0.3, -0.2, { min: 0.137, max: 8 })).toBe(0.137)
    })
  })

  await describe('snapZoomToWholePixel at the fit-minimum', async () => {
    await it('rests on a fractional minimum instead of springing out', async () => {
      expect(snapZoomToWholePixel(0.137, { min: 0.137, max: 8 })).toBe(0.137)
    })
  })

  await describe('wantsDotLod', async () => {
    await it('switches to dots below the threshold', async () => {
      expect(wantsDotLod(0.4, 16, 8, false)).toBe(true)
      expect(wantsDotLod(0.5, 16, 8, false)).toBe(false)
    })

    await it('leaves dots only past the hysteresis margin', async () => {
      expect(wantsDotLod(0.52, 16, 8, true)).toBe(true)
      expect(wantsDotLod(0.57, 16, 8, true)).toBe(false)
    })
  })
}
