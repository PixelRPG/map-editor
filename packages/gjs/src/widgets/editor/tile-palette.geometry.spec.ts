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

      await it('stays square at an aspect of exactly 1', async () => {
        expect(cellDimensions(48, 1)).toStrictEqual([48, 48])
      })

      await it('rounds a near-square aspect back to square', async () => {
        // Just below 1 takes the height-limited branch, but the rounded
        // width lands back on `size` — no one-pixel jitter at the boundary.
        expect(cellDimensions(48, 0.999999)).toStrictEqual([48, 48])
      })

      await it('rounds the short axis rather than truncating', async () => {
        // 48 / 1.5 = 32 exactly; 48 / 0.7 = 68.57 → the WIDTH is capped.
        expect(cellDimensions(48, 1.5)).toStrictEqual([48, 32])
        expect(cellDimensions(48, 0.7)).toStrictEqual([34, 48])
      })

      await it('caps the shorter axis at one pixel for a huge aspect', async () => {
        expect(cellDimensions(2, 100)).toStrictEqual([2, 1])
      })

      await it('degenerates to zero at size 0 rather than throwing', async () => {
        expect(cellDimensions(0, null)).toStrictEqual([0, 0])
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

      await it('returns null for a negative height', async () => {
        expect(cellAspectOf({ width: 16, height: -4 })).toBe(null)
      })

      await it('returns 0 for a zero-width sprite (a real, if useless, aspect)', async () => {
        expect(cellAspectOf({ width: 0, height: 32 })).toBe(0)
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

      await it('ignores the wrap cap while not wrapping', async () => {
        expect(linePolicy(3, false, 64)).toStrictEqual([3, 3])
      })

      await it('passes a zero column count straight through', async () => {
        // The palette never sets 0, but the policy does not invent a
        // minimum — a caller that does gets a visibly broken grid, not a
        // silently corrected one.
        expect(linePolicy(0, false, 64)).toStrictEqual([0, 0])
      })
    })
  })
}
