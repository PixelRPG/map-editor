import { describe, expect, it } from '@gjsify/unit'

import { mapOverviewRect, type OverviewTransform, overviewTransform } from './atlas-overview.geometry.ts'

/** The transform, asserted to exist — every caller checks for null first. */
function transformOf(widgetW: number, widgetH: number, contentW: number, contentH: number): OverviewTransform {
  const transform = overviewTransform(widgetW, widgetH, contentW, contentH)
  if (!transform) throw new Error('expected a transform')
  return transform
}

export default async () => {
  await describe('atlas-overview.geometry', async () => {
    await describe('overviewTransform', async () => {
      await it('maps 1:1 when the content matches the widget', async () => {
        expect(transformOf(200, 100, 200, 100)).toStrictEqual({ scale: 1, offsetX: 0, offsetY: 0 })
      })

      await it('picks the limiting axis and centres the other', async () => {
        // Content 200x100 into 200x200: width-limited, 100 px of slack in y.
        expect(transformOf(200, 200, 200, 100)).toStrictEqual({ scale: 1, offsetX: 0, offsetY: 50 })
      })

      await it('centres horizontally when height is the limit', async () => {
        expect(transformOf(200, 100, 100, 100)).toStrictEqual({ scale: 1, offsetX: 50, offsetY: 0 })
      })

      await it('shrinks content larger than the widget', async () => {
        expect(transformOf(100, 100, 400, 200)).toStrictEqual({ scale: 0.25, offsetX: 0, offsetY: 25 })
      })

      await it('UPSCALES content smaller than the widget', async () => {
        // Deliberate: the overview is a schematic, so a tiny world fills
        // the minimap rather than sitting as a speck in the middle.
        expect(transformOf(400, 400, 100, 100)).toStrictEqual({ scale: 4, offsetX: 0, offsetY: 0 })
      })

      await it('is null before the widget has an allocation', async () => {
        expect(overviewTransform(0, 0, 100, 100)).toBe(null)
        expect(overviewTransform(100, 0, 100, 100)).toBe(null)
        expect(overviewTransform(0, 100, 100, 100)).toBe(null)
      })

      await it('is null for an empty world instead of dividing by zero', async () => {
        expect(overviewTransform(100, 100, 0, 0)).toBe(null)
        expect(overviewTransform(100, 100, 100, 0)).toBe(null)
        expect(overviewTransform(100, 100, 0, 100)).toBe(null)
      })

      await it('is null for a negative content box', async () => {
        expect(overviewTransform(100, 100, -10, 100)).toBe(null)
      })
    })

    await describe('mapOverviewRect', async () => {
      const transform = { scale: 0.5, offsetX: 10, offsetY: 20 }

      await it('scales the position and adds the centring offset', async () => {
        expect(mapOverviewRect({ x: 40, y: 60, w: 20, h: 40 }, transform)).toStrictEqual({
          x: 30,
          y: 50,
          w: 10,
          h: 20,
        })
      })

      await it('puts the content origin exactly on the offset', async () => {
        expect(mapOverviewRect({ x: 0, y: 0, w: 100, h: 100 }, transform)).toStrictEqual({
          x: 10,
          y: 20,
          w: 50,
          h: 50,
        })
      })

      await it('floors a sub-pixel scene at one pixel so it stays visible', async () => {
        const tiny = mapOverviewRect({ x: 0, y: 0, w: 1, h: 1 }, { scale: 0.01, offsetX: 0, offsetY: 0 })
        expect({ w: tiny.w, h: tiny.h }).toStrictEqual({ w: 1, h: 1 })
      })

      await it('floors a zero-area scene at one pixel too', async () => {
        const empty = mapOverviewRect({ x: 5, y: 5, w: 0, h: 0 }, transform)
        expect({ w: empty.w, h: empty.h }).toStrictEqual({ w: 1, h: 1 })
      })

      await it('does NOT floor the position — only the size', async () => {
        const behind = mapOverviewRect({ x: -100, y: -100, w: 10, h: 10 }, transform)
        expect({ x: behind.x, y: behind.y }).toStrictEqual({ x: -40, y: -30 })
      })

      await it('keeps a fractional scale exact rather than rounding', async () => {
        const scaled = mapOverviewRect({ x: 3, y: 3, w: 3, h: 3 }, { scale: 1 / 3, offsetX: 0, offsetY: 0 })
        expect(scaled.x).toBe(1)
        expect(scaled.w).toBe(1)
      })
    })
  })
}
