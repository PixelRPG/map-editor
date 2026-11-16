import { describe, expect, it } from '@gjsify/unit'

import { fitSheetThumbnail } from './sheet-thumbnail.geometry.ts'

export default async () => {
  await describe('fitSheetThumbnail', async () => {
    await it('downscales a sheet larger than the box to the exact fit', async () => {
      const fit = fitSheetThumbnail(160, 160, 320, 320)
      expect(fit?.scale).toBe(0.5)
      expect(fit?.width).toBe(160)
      expect(fit?.height).toBe(160)
      expect(fit?.nearest).toBe(false)
    })

    await it('keeps the aspect of a wide sheet and centres it vertically', async () => {
      const fit = fitSheetThumbnail(160, 160, 640, 160)
      expect(fit?.width).toBe(160)
      expect(fit?.height).toBe(40)
      expect(fit?.x).toBe(0)
      expect(fit?.y).toBe(60)
    })

    await it('keeps the aspect of a tall sheet and centres it horizontally', async () => {
      const fit = fitSheetThumbnail(160, 160, 160, 640)
      expect(fit?.width).toBe(40)
      expect(fit?.height).toBe(160)
      expect(fit?.x).toBe(60)
      expect(fit?.y).toBe(0)
    })

    await it('upscales only at a whole factor', async () => {
      // 160 / 48 is 3.33: a 3× draw keeps pixel edges on pixel
      // boundaries, where the exact fit would smear every third row.
      const fit = fitSheetThumbnail(160, 160, 48, 48)
      expect(fit?.scale).toBe(3)
      expect(fit?.width).toBe(144)
      expect(fit?.nearest).toBe(true)
    })

    await it('asks for nearest at exactly 1×', async () => {
      const fit = fitSheetThumbnail(160, 160, 160, 160)
      expect(fit?.scale).toBe(1)
      expect(fit?.nearest).toBe(true)
      expect(fit?.x).toBe(0)
    })

    await it('rounds the centring offset to whole pixels', async () => {
      const fit = fitSheetThumbnail(160, 160, 32, 49)
      // 3× of 49 is 147, leaving 13 px of slack: a 6.5 px offset would
      // put the upscale on a half pixel.
      expect(fit?.scale).toBe(3)
      expect(fit?.y).toBe(7)
      expect(Number.isInteger(fit?.x)).toBe(true)
    })

    await it('returns null for an unmeasured box', async () => {
      expect(fitSheetThumbnail(0, 160, 32, 32)).toBe(null)
      expect(fitSheetThumbnail(160, 0, 32, 32)).toBe(null)
    })

    await it('returns null for an empty sheet', async () => {
      expect(fitSheetThumbnail(160, 160, 0, 32)).toBe(null)
      expect(fitSheetThumbnail(160, 160, 32, -1)).toBe(null)
    })
  })
}
