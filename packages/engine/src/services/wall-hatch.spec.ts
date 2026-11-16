/**
 * "Show walls" hatch geometry.
 *
 * Two properties carry the whole overlay and neither is visible by
 * eye on a 16 px tile: the hatch must never claim a part of a tile the
 * hero can walk through, and it must continue across the seam between
 * two blocked tiles instead of restarting its phase in each one.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { ColliderShape } from '../types/data/index.ts'
import {
  type HatchRect,
  type HatchSegment,
  hatchSegments,
  WALL_HATCH_SPACING,
  wallHatchSegments,
  wallRectsOf,
} from './wall-hatch.ts'

const rect = (x: number, y: number, width: number, height: number): ColliderShape => ({
  type: 'rectangle',
  width,
  height,
  offset: { x, y },
})

/** Whether every endpoint of `segment` sits inside `bounds` (with a float tolerance). */
function inside(segment: HatchSegment, bounds: HatchRect): boolean {
  const e = 1e-9
  const within = (x: number, y: number): boolean =>
    x >= bounds.x - e && x <= bounds.x + bounds.width + e && y >= bounds.y - e && y <= bounds.y + bounds.height + e
  return within(segment.x0, segment.y0) && within(segment.x1, segment.y1)
}

export default async () => {
  await describe('wallRectsOf', async () => {
    await it('reports nothing for a tile that does not block', async () => {
      expect(wallRectsOf(undefined, 16, 16).length).toBe(0)
      expect(wallRectsOf(null, 16, 16).length).toBe(0)
      expect(wallRectsOf({ solid: false }, 16, 16).length).toBe(0)
    })

    await it('ignores shapes on a tile that does not block', async () => {
      // Excalibur skips colliders on a non-solid tile, so the overlay
      // must too — otherwise it hatches a tile the hero walks straight
      // through.
      expect(wallRectsOf({ solid: false, colliders: [rect(0, 0, 8, 16)] }, 16, 16).length).toBe(0)
    })

    await it('covers the whole tile for a solid tile without shapes', async () => {
      expect(wallRectsOf({ solid: true }, 16, 24)).toStrictEqual([{ x: 0, y: 0, width: 16, height: 24 }])
      expect(wallRectsOf({ solid: true, colliders: [] }, 16, 16)).toStrictEqual([{ x: 0, y: 0, width: 16, height: 16 }])
    })

    await it('passes rectangle colliders through, offset included', async () => {
      expect(wallRectsOf({ solid: true, colliders: [rect(0, 8, 16, 8)] }, 16, 16)).toStrictEqual([
        { x: 0, y: 8, width: 16, height: 8 },
      ])
    })

    await it('treats a missing offset as the tile origin', async () => {
      expect(
        wallRectsOf({ solid: true, colliders: [{ type: 'rectangle', width: 8, height: 8 }] }, 16, 16),
      ).toStrictEqual([{ x: 0, y: 0, width: 8, height: 8 }])
    })

    await it('keeps every shape of a multi-collider tile', async () => {
      const rects = wallRectsOf({ solid: true, colliders: [rect(0, 0, 4, 4), rect(12, 12, 4, 4)] }, 16, 16)
      expect(rects.length).toBe(2)
      expect(rects[1]).toStrictEqual({ x: 12, y: 12, width: 4, height: 4 })
    })

    await it('drops a degenerate shape instead of hatching a zero-width sliver', async () => {
      expect(wallRectsOf({ solid: true, colliders: [rect(0, 0, 0, 16)] }, 16, 16).length).toBe(0)
    })

    await it('approximates a circle by its bounding box', async () => {
      expect(
        wallRectsOf({ solid: true, colliders: [{ type: 'circle', radius: 4, offset: { x: 8, y: 8 } }] }, 16, 16),
      ).toStrictEqual([{ x: 4, y: 4, width: 8, height: 8 }])
    })

    await it('centres a circle with no offset on the tile', async () => {
      expect(wallRectsOf({ solid: true, colliders: [{ type: 'circle', radius: 2 }] }, 16, 16)).toStrictEqual([
        { x: 6, y: 6, width: 4, height: 4 },
      ])
    })

    await it('approximates a polygon by its bounding box', async () => {
      const points = [
        { x: 2, y: 16 },
        { x: 8, y: 4 },
        { x: 14, y: 16 },
      ]
      expect(wallRectsOf({ solid: true, colliders: [{ type: 'polygon', points }] }, 16, 16)).toStrictEqual([
        { x: 2, y: 4, width: 12, height: 12 },
      ])
    })

    await it('drops an empty polygon', async () => {
      expect(wallRectsOf({ solid: true, colliders: [{ type: 'polygon', points: [] }] }, 16, 16).length).toBe(0)
    })
  })

  await describe('hatchSegments', async () => {
    await it('draws nothing for a degenerate rectangle or spacing', async () => {
      expect(hatchSegments({ x: 0, y: 0, width: 0, height: 16 }).length).toBe(0)
      expect(hatchSegments({ x: 0, y: 0, width: 16, height: 0 }).length).toBe(0)
      expect(hatchSegments({ x: 0, y: 0, width: 16, height: 16 }, 0).length).toBe(0)
    })

    await it('fills a square with 45° lines', async () => {
      const bounds = { x: 0, y: 0, width: 16, height: 16 }
      const segments = hatchSegments(bounds, 4)
      expect(segments.length > 0).toBe(true)
      for (const segment of segments) {
        expect(Math.abs(segment.x1 - segment.x0)).toBe(Math.abs(segment.y1 - segment.y0))
        expect(segment.y1 > segment.y0).toBe(true)
      }
    })

    await it('clips every line to the rectangle', async () => {
      const bounds = { x: 5, y: 7, width: 23, height: 11 }
      for (const segment of hatchSegments(bounds, 3)) {
        expect(inside(segment, bounds)).toBe(true)
      }
    })

    await it('scales the line count with the rectangle, not with its position', async () => {
      const here = hatchSegments({ x: 0, y: 0, width: 24, height: 24 }, 6)
      const moved = hatchSegments({ x: 60, y: 120, width: 24, height: 24 }, 6)
      expect(moved.length).toBe(here.length)
    })

    await it('continues its lines across the seam between two touching rectangles', async () => {
      // The reason the phase is anchored to the origin: a wall two
      // tiles wide must read as one hatched shape, not as two.
      // A line leaving through the bottom-right CORNER is genuinely
      // finished — it would continue below the right rectangle — so
      // only the exits through the shared edge proper are checked.
      const left = hatchSegments({ x: 0, y: 0, width: 12, height: 24 }, 6)
      const right = hatchSegments({ x: 12, y: 0, width: 12, height: 24 }, 6)
      const exits = left.filter((segment) => segment.x1 === 12 && segment.y1 < 24)
      expect(exits.length).toBe(3)
      for (const exit of exits) {
        const continued = right.some((segment) => segment.x0 === exit.x1 && segment.y0 === exit.y1)
        expect(continued).toBe(true)
      }
    })

    await it('ships a spacing default', async () => {
      const bounds = { x: 0, y: 0, width: 32, height: 32 }
      expect(hatchSegments(bounds).length).toBe(hatchSegments(bounds, WALL_HATCH_SPACING).length)
    })
  })

  await describe('wallHatchSegments', async () => {
    await it('draws nothing for a walkable tile', async () => {
      expect(wallHatchSegments({ solid: false }, 16, 16, { x: 0, y: 0, width: 64, height: 64 }).length).toBe(0)
    })

    await it('refuses a degenerate tile size instead of dividing by zero', async () => {
      expect(wallHatchSegments({ solid: true }, 0, 16, { x: 0, y: 0, width: 64, height: 64 }).length).toBe(0)
    })

    await it('scales a half-tile wall into the top half of the cell', async () => {
      const cell = { x: 10, y: 20, width: 64, height: 64 }
      const segments = wallHatchSegments({ solid: true, colliders: [rect(0, 0, 16, 8)] }, 16, 16, cell, 6)
      expect(segments.length > 0).toBe(true)
      const topHalf = { x: cell.x, y: cell.y, width: cell.width, height: cell.height / 2 }
      for (const segment of segments) {
        expect(inside(segment, topHalf)).toBe(true)
      }
    })

    await it('hatches the whole cell for a wall without shapes', async () => {
      const cell = { x: 0, y: 0, width: 32, height: 32 }
      const whole = wallHatchSegments({ solid: true }, 16, 16, cell, 6)
      const half = wallHatchSegments({ solid: true, colliders: [rect(0, 0, 16, 8)] }, 16, 16, cell, 6)
      expect(whole.length > half.length).toBe(true)
    })

    await it('hatches each shape of a multi-collider tile', async () => {
      const cell = { x: 0, y: 0, width: 48, height: 48 }
      const one = wallHatchSegments({ solid: true, colliders: [rect(0, 0, 16, 4)] }, 16, 16, cell, 6)
      const two = wallHatchSegments(
        { solid: true, colliders: [rect(0, 0, 16, 4), rect(0, 12, 16, 4)] },
        16,
        16,
        cell,
        6,
      )
      expect(two.length).toBe(one.length * 2)
    })
  })
}
