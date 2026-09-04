import { describe, expect, it } from '@gjsify/unit'

import { cellAspectOf, cellDimensions, linePolicy, swatchDimensions } from './tile-palette.geometry.ts'

export default async () => {
  await describe('tile-palette.geometry', async () => {
    await describe('cellDimensions', async () => {
      await it('keeps an unknown aspect square', async () => {
        expect(cellDimensions(48, null)).toStrictEqual([48, 48])
      })

      await it('makes width the longer axis for wide cells', async () => {
        expect(cellDimensions(48, 2)).toStrictEqual([48, 24])
      })

      await it('makes height the longer axis for tall cells', async () => {
        expect(cellDimensions(48, 0.5)).toStrictEqual([24, 48])
      })

      await it('never collapses the shorter axis below one pixel', async () => {
        expect(cellDimensions(2, 0.01)).toStrictEqual([1, 2])
      })
    })

    await describe('cellAspectOf', async () => {
      await it('divides width by height', async () => {
        expect(cellAspectOf({ width: 16, height: 32 })).toBe(0.5)
      })

      await it('returns null without a sprite', async () => {
        expect(cellAspectOf(undefined)).toBe(null)
      })

      await it('returns null for a zero-height sprite', async () => {
        expect(cellAspectOf({ width: 16, height: 0 })).toBe(null)
      })
    })

    await describe('swatchDimensions', async () => {
      await it('ignores the aspect in fill mode', async () => {
        expect(swatchDimensions(42, 'fill', 0.5)).toStrictEqual([42, 42])
      })

      await it('applies the aspect in contain mode', async () => {
        expect(swatchDimensions(48, 'contain', 0.5)).toStrictEqual([24, 48])
      })

      await it('stays square in contain mode without a known aspect', async () => {
        expect(swatchDimensions(42, 'contain', null)).toStrictEqual([42, 42])
      })
    })

    await describe('linePolicy', async () => {
      await it('pins both bounds to the column count when not wrapping', async () => {
        expect(linePolicy(5, false, 64)).toStrictEqual([5, 5])
      })

      await it('lets width decide the row when wrapping', async () => {
        expect(linePolicy(5, true, 64)).toStrictEqual([1, 64])
      })
    })
  })
}
