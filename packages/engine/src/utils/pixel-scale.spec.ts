import { describe, expect, it } from '@gjsify/unit'

import { deviceViewport, letterbox, pixelScale, pixelScaleOfZoom, uiScale, zoomForPixelScale } from './pixel-scale.ts'

// 15 × 10 tiles of 16 px: the smallest window a run promises.
const BUDGET = { width: 240, height: 160 }
const BIG_MAP = { width: 3200, height: 3200 }

const PHONE = { width: 400, height: 880 }
const DESKTOP = { width: 1920, height: 1200 }

// Hand-computed: min(vw / 240, vh / 160), floored.
const EXPECTED: ReadonlyArray<{ ratio: number; phone: number; desktop: number }> = [
  { ratio: 1, phone: 1, desktop: 7 },
  { ratio: 1.25, phone: 2, desktop: 9 },
  { ratio: 1.5, phone: 2, desktop: 11 },
  { ratio: 2, phone: 3, desktop: 15 },
]

export default async () => {
  await describe('pixelScale', async () => {
    for (const { ratio, phone, desktop } of EXPECTED) {
      await it(`picks a whole k at ${ratio * 100} % display scale`, async () => {
        expect(pixelScale({ viewport: deviceViewport(PHONE, ratio), content: BUDGET })).toBe(phone)
        expect(pixelScale({ viewport: deviceViewport(DESKTOP, ratio), content: BUDGET })).toBe(desktop)
      })
    }

    await it('never drops below 1 for a viewport smaller than one game screen', async () => {
      expect(pixelScale({ viewport: { width: 100, height: 50 }, content: BUDGET })).toBe(1)
      expect(pixelScale({ viewport: { width: 1, height: 1 }, content: BUDGET })).toBe(1)
    })

    await it('falls back to 1 on unusable input', async () => {
      expect(pixelScale({ viewport: { width: 0, height: 100 }, content: BUDGET })).toBe(1)
      expect(pixelScale({ viewport: DESKTOP, content: { width: 0, height: 0 } })).toBe(1)
      expect(pixelScale({ viewport: { width: Number.NaN, height: 100 }, content: BUDGET })).toBe(1)
    })

    await it('lets the tighter axis decide', async () => {
      expect(pixelScale({ viewport: { width: 2400, height: 400 }, content: BUDGET })).toBe(2)
      expect(pixelScale({ viewport: { width: 480, height: 4000 }, content: BUDGET })).toBe(2)
    })

    await it('honours a cap, but never below 1', async () => {
      expect(pixelScale({ viewport: DESKTOP, content: BUDGET, max: 4 })).toBe(4)
      expect(pixelScale({ viewport: DESKTOP, content: BUDGET, max: 0 })).toBe(7)
    })

    await it('shows a map smaller than the budget as large as it fits', async () => {
      expect(pixelScale({ viewport: DESKTOP, content: { width: 160, height: 128 } })).toBe(9)
    })

    await it('is the same for a map that is bigger than the viewport', async () => {
      expect(pixelScale({ viewport: DESKTOP, content: BIG_MAP })).toBe(1)
    })
  })

  await describe('deviceViewport', async () => {
    await it('rounds like the GL drawing buffer', async () => {
      const v = deviceViewport({ width: 401, height: 881 }, 1.25)
      expect(v.width).toBe(501)
      expect(v.height).toBe(1101)
    })

    await it('treats a garbage ratio as 1', async () => {
      expect(deviceViewport(PHONE, 0).width).toBe(400)
      expect(deviceViewport(PHONE, Number.NaN).height).toBe(880)
    })
  })

  await describe('zoom conversion', async () => {
    await it('turns k into a logical-pixel camera zoom and back', async () => {
      for (const ratio of [1, 1.25, 1.5, 2]) {
        for (const k of [1, 2, 3, 7, 15]) {
          expect(pixelScaleOfZoom(zoomForPixelScale(k, ratio), ratio)).toBe(k)
        }
      }
    })

    await it('reports a fractional device scale as null', async () => {
      expect(pixelScaleOfZoom(1, 1.5)).toBe(null)
      expect(pixelScaleOfZoom(1.3, 1)).toBe(null)
    })
  })

  await describe('uiScale', async () => {
    await it('follows the same rule against the size the UI was laid out for', async () => {
      expect(uiScale(deviceViewport(DESKTOP, 1.5), { width: 320, height: 180 })).toBe(9)
      expect(uiScale({ width: 200, height: 100 }, { width: 320, height: 180 })).toBe(1)
    })
  })

  await describe('letterbox', async () => {
    await it('centres the leftover on whole device pixels', async () => {
      const box = letterbox({ width: 500, height: 1100 }, { width: 480, height: 320 })
      expect(box.left).toBe(10)
      expect(box.right).toBe(10)
      expect(box.top).toBe(390)
      expect(box.bottom).toBe(390)
    })

    await it('puts an odd extra pixel on the right and bottom', async () => {
      const box = letterbox({ width: 501, height: 301 }, { width: 480, height: 300 })
      expect(box.left).toBe(10)
      expect(box.right).toBe(11)
      expect(box.top).toBe(0)
      expect(box.bottom).toBe(1)
    })

    await it('has no border on an axis the picture overflows', async () => {
      const box = letterbox({ width: 100, height: 100 }, { width: 240, height: 160 })
      expect(box.left + box.right + box.top + box.bottom).toBe(0)
    })
  })
}
