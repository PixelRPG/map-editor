import { describe, expect, it } from '@gjsify/unit'

import { BRUSH_SAMPLE_STEP, strokeSamples } from './stroke-samples.ts'

export default async () => {
  await describe('strokeSamples', async () => {
    await it('always ends on the target point', async () => {
      const points = strokeSamples({ x: 0, y: 0 }, { x: 100, y: 40 })
      const last = points[points.length - 1]
      expect(last?.x).toBe(100)
      expect(last?.y).toBe(40)
    })

    await it('yields a single point when the pointer has not moved', async () => {
      const points = strokeSamples({ x: 7, y: 9 }, { x: 7, y: 9 })
      expect(points.length).toBe(1)
      expect(points[0]?.x).toBe(7)
      expect(points[0]?.y).toBe(9)
    })

    await it('keeps consecutive samples within the step', async () => {
      const points = strokeSamples({ x: 0, y: 0 }, { x: 320, y: 0 }, 8)
      let previous = 0
      for (const point of points) {
        expect(Math.abs(point.x - previous)).toBeLessThanOrEqual(8)
        previous = point.x
      }
    })

    await it('samples a long flick densely enough to hit every cell', async () => {
      // The worst case a brush has to survive: one drag update spanning
      // a whole 32-column row of the smallest swatches.
      const points = strokeSamples({ x: 0, y: 0 }, { x: 384, y: 0 })
      expect(points.length).toBe(384 / BRUSH_SAMPLE_STEP)
    })

    await it('walks diagonally, not axis by axis', async () => {
      // A 3-4-5 diagonal: 50px at step 10 is five samples, each
      // advancing BOTH axes. Step counting goes by the segment's
      // length, not by its longer axis, so the samples stay `step`
      // apart along the stroke itself.
      const points = strokeSamples({ x: 0, y: 0 }, { x: 30, y: 40 }, 10)
      expect(points.map((point) => `${point.x},${point.y}`).join(' ')).toBe('6,8 12,16 18,24 24,32 30,40')
    })

    await it('handles a backwards drag', async () => {
      const points = strokeSamples({ x: 30, y: 0 }, { x: 10, y: 0 }, 10)
      expect(points.map((point) => `${point.x},${point.y}`).join(' ')).toBe('20,0 10,0')
    })

    await it('treats a zero or negative step as one pixel', async () => {
      expect(strokeSamples({ x: 0, y: 0 }, { x: 3, y: 0 }, 0).length).toBe(3)
      expect(strokeSamples({ x: 0, y: 0 }, { x: 3, y: 0 }, -5).length).toBe(3)
    })
  })
}
