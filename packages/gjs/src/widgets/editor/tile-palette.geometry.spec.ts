import { describe, expect, it } from '@gjsify/unit'

import {
  BRUSH_SAMPLE_STEP,
  cellAspectOf,
  cellDimensions,
  linePolicy,
  strokeSamples,
  swatchDimensions,
} from './tile-palette.geometry.ts'

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

    await describe('strokeSamples', async () => {
      await it('always ends on the target point', async () => {
        const points = strokeSamples({ x: 0, y: 0 }, { x: 100, y: 40 })
        expect(points[points.length - 1]).toStrictEqual({ x: 100, y: 40 })
      })

      await it('yields a single point when the pointer has not moved', async () => {
        expect(strokeSamples({ x: 7, y: 9 }, { x: 7, y: 9 })).toStrictEqual([{ x: 7, y: 9 }])
      })

      await it('keeps consecutive samples within the step', async () => {
        const points = strokeSamples({ x: 0, y: 0 }, { x: 320, y: 0 }, 8)
        let previous = { x: 0, y: 0 }
        for (const point of points) {
          expect(Math.abs(point.x - previous.x)).toBeLessThanOrEqual(8)
          previous = point
        }
      })

      await it('samples a long flick densely enough to hit every 12px cell', async () => {
        // The worst case the brush has to survive: one `drag-update`
        // spanning a whole 32-column row of the smallest swatches.
        const points = strokeSamples({ x: 0, y: 0 }, { x: 384, y: 0 })
        expect(points.length).toBe(384 / BRUSH_SAMPLE_STEP)
      })

      await it('walks diagonally, not axis by axis', async () => {
        // A 3-4-5 diagonal: 50px at step 10 is five samples, each
        // advancing BOTH axes. Step counting goes by the segment's
        // length, not by its longer axis, so the samples stay `step`
        // apart along the stroke itself.
        expect(strokeSamples({ x: 0, y: 0 }, { x: 30, y: 40 }, 10)).toStrictEqual([
          { x: 6, y: 8 },
          { x: 12, y: 16 },
          { x: 18, y: 24 },
          { x: 24, y: 32 },
          { x: 30, y: 40 },
        ])
      })

      await it('handles a backwards drag', async () => {
        expect(strokeSamples({ x: 30, y: 0 }, { x: 10, y: 0 }, 10)).toStrictEqual([
          { x: 20, y: 0 },
          { x: 10, y: 0 },
        ])
      })

      await it('treats a zero or negative step as one pixel', async () => {
        expect(strokeSamples({ x: 0, y: 0 }, { x: 3, y: 0 }, 0).length).toBe(3)
        expect(strokeSamples({ x: 0, y: 0 }, { x: 3, y: 0 }, -5).length).toBe(3)
      })
    })
  })
}
