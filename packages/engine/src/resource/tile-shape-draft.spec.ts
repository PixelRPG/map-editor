/**
 * The free-form half of per-tile collision: what a drag on the
 * magnified tile means.
 *
 * The properties worth holding, beyond the individual coordinates:
 *
 *   1. Nothing degenerate is ever stored — a drag that collapsed to a
 *      line, a circle under a pixel, a polygon with two corners. Such a
 *      shape blocks nothing and would sit in the list as an entry the
 *      author cannot see or hit.
 *   2. Snapped points stay inside the tile, on whole pixels, so a
 *      collider renders in the editor exactly where it meshes in the
 *      engine.
 *   3. `isPixelBlocked` agrees with the shapes on a shared edge: two
 *      rectangles meeting at a seam cover the pixels either side of it
 *      and leave no gap.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { ColliderShape } from '../types/data/index.ts'
import {
  circleBetween,
  closesPolygon,
  isPixelBlocked,
  polygonOf,
  rectangleBetween,
  removeShapeAt,
  shapeBounds,
  snapToTile,
} from './tile-shape-draft.ts'

const TILE = { width: 16, height: 16 }

export default async () => {
  await describe('snapToTile', async () => {
    await it('rounds to whole pixel corners', async () => {
      expect(snapToTile({ x: 3.4, y: 7.6 }, TILE)).toStrictEqual({ x: 3, y: 8 })
    })

    await it('clamps a point dragged past the tile', async () => {
      expect(snapToTile({ x: -4, y: 99 }, TILE)).toStrictEqual({ x: 0, y: 16 })
    })

    await it('allows the far edge itself', async () => {
      expect(snapToTile({ x: 16, y: 16 }, TILE)).toStrictEqual({ x: 16, y: 16 })
    })
  })

  await describe('rectangleBetween', async () => {
    await it('anchors at the top-left corner whichever way the drag went', async () => {
      const forward = rectangleBetween({ x: 2, y: 3 }, { x: 10, y: 12 })
      const backward = rectangleBetween({ x: 10, y: 12 }, { x: 2, y: 3 })
      expect(forward).toStrictEqual({ type: 'rectangle', width: 8, height: 9, offset: { x: 2, y: 3 } })
      expect(backward).toStrictEqual(forward)
    })

    await it('refuses a drag with no area', async () => {
      expect(rectangleBetween({ x: 4, y: 4 }, { x: 4, y: 9 })).toBeNull()
      expect(rectangleBetween({ x: 4, y: 4 }, { x: 4, y: 4 })).toBeNull()
    })
  })

  await describe('circleBetween', async () => {
    await it('stores the centre as the offset and the drag as the radius', async () => {
      expect(circleBetween({ x: 8, y: 8 }, { x: 8, y: 2 })).toStrictEqual({
        type: 'circle',
        radius: 6,
        offset: { x: 8, y: 8 },
      })
    })

    await it('refuses a radius under one pixel', async () => {
      expect(circleBetween({ x: 8, y: 8 }, { x: 8, y: 8 })).toBeNull()
    })

    await it('keeps a radius that bulges past the tile edge', async () => {
      const shape = circleBetween({ x: 14, y: 14 }, { x: 24, y: 14 })
      expect(shape).toStrictEqual({ type: 'circle', radius: 10, offset: { x: 14, y: 14 } })
    })
  })

  await describe('polygonOf', async () => {
    await it('keeps three distinct corners', async () => {
      const points = [
        { x: 0, y: 0 },
        { x: 16, y: 0 },
        { x: 8, y: 16 },
      ]
      expect(polygonOf(points)).toStrictEqual({ type: 'polygon', points })
    })

    await it('drops a repeated click and the implicit closing point', async () => {
      const shape = polygonOf([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 16, y: 0 },
        { x: 8, y: 16 },
        { x: 0, y: 0 },
      ])
      expect(shape).toStrictEqual({
        type: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 16, y: 0 },
          { x: 8, y: 16 },
        ],
      })
    })

    await it('refuses fewer than three corners', async () => {
      expect(
        polygonOf([
          { x: 0, y: 0 },
          { x: 16, y: 0 },
        ]),
      ).toBeNull()
      expect(polygonOf([])).toBeNull()
    })
  })

  await describe('closesPolygon', async () => {
    const started = [
      { x: 2, y: 2 },
      { x: 12, y: 2 },
      { x: 12, y: 12 },
    ]

    await it('closes on a click back at the first corner', async () => {
      expect(closesPolygon(started, { x: 3, y: 2 })).toBe(true)
    })

    await it('does not close on a click elsewhere', async () => {
      expect(closesPolygon(started, { x: 2, y: 12 })).toBe(false)
    })

    await it('does not close before three corners exist', async () => {
      expect(closesPolygon(started.slice(0, 2), { x: 2, y: 2 })).toBe(false)
    })
  })

  await describe('shapeBounds', async () => {
    await it('centres an offset-less circle on the tile', async () => {
      expect(shapeBounds({ type: 'circle', radius: 4 }, TILE)).toStrictEqual({ x: 4, y: 4, width: 8, height: 8 })
    })

    await it('puts an offset-less rectangle at the top-left', async () => {
      expect(shapeBounds({ type: 'rectangle', width: 6, height: 5 }, TILE)).toStrictEqual({
        x: 0,
        y: 0,
        width: 6,
        height: 5,
      })
    })

    await it('spans a polygon from its extremes', async () => {
      const shape: ColliderShape = {
        type: 'polygon',
        points: [
          { x: 4, y: 2 },
          { x: 12, y: 6 },
          { x: 6, y: 14 },
        ],
      }
      expect(shapeBounds(shape, TILE)).toStrictEqual({ x: 4, y: 2, width: 8, height: 12 })
    })

    await it('has no bounds for a polygon with no points', async () => {
      expect(shapeBounds({ type: 'polygon', points: [] }, TILE)).toBeNull()
    })
  })

  await describe('isPixelBlocked', async () => {
    await it('reports the pixels a rectangle covers and no others', async () => {
      const shapes: ColliderShape[] = [{ type: 'rectangle', width: 4, height: 4, offset: { x: 2, y: 2 } }]
      expect(isPixelBlocked(shapes, 2, 2, TILE)).toBe(true)
      expect(isPixelBlocked(shapes, 5, 5, TILE)).toBe(true)
      expect(isPixelBlocked(shapes, 6, 5, TILE)).toBe(false)
      expect(isPixelBlocked(shapes, 1, 2, TILE)).toBe(false)
    })

    await it('leaves no gap where two rectangles meet', async () => {
      const shapes: ColliderShape[] = [
        { type: 'rectangle', width: 8, height: 16, offset: { x: 0, y: 0 } },
        { type: 'rectangle', width: 8, height: 16, offset: { x: 8, y: 0 } },
      ]
      for (let x = 0; x < TILE.width; x++) expect(isPixelBlocked(shapes, x, 8, TILE)).toBe(true)
    })

    await it('follows a circle, not its bounding box', async () => {
      const shapes: ColliderShape[] = [{ type: 'circle', radius: 6, offset: { x: 8, y: 8 } }]
      expect(isPixelBlocked(shapes, 8, 3, TILE)).toBe(true)
      expect(isPixelBlocked(shapes, 2, 2, TILE)).toBe(false)
    })

    await it('follows a concave polygon', async () => {
      // An L: the top-right quadrant is outside the outline but inside
      // the bounding box, which is what separates the two readings.
      const shapes: ColliderShape[] = [
        {
          type: 'polygon',
          points: [
            { x: 0, y: 0 },
            { x: 8, y: 0 },
            { x: 8, y: 8 },
            { x: 16, y: 8 },
            { x: 16, y: 16 },
            { x: 0, y: 16 },
          ],
        },
      ]
      expect(isPixelBlocked(shapes, 2, 2, TILE)).toBe(true)
      expect(isPixelBlocked(shapes, 12, 12, TILE)).toBe(true)
      expect(isPixelBlocked(shapes, 12, 2, TILE)).toBe(false)
    })

    await it('blocks nothing without shapes', async () => {
      expect(isPixelBlocked([], 8, 8, TILE)).toBe(false)
    })
  })

  await describe('removeShapeAt', async () => {
    const shapes: ColliderShape[] = [
      { type: 'rectangle', width: 4, height: 4 },
      { type: 'circle', radius: 3 },
    ]

    await it('drops the named entry', async () => {
      expect(removeShapeAt(shapes, 0)).toStrictEqual([{ type: 'circle', radius: 3 }])
    })

    await it('copies the list unchanged for an index it does not hold', async () => {
      const result = removeShapeAt(shapes, 7)
      expect(result.length).toBe(2)
      expect(result === shapes).toBe(false)
    })
  })
}
