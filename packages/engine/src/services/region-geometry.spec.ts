import { describe, expect, it } from '@gjsify/unit'

import type { GridCell } from './flood-fill.ts'
import { computeRegionBounds, computeRegionOutline, computeRegionRuns, type RegionSegment } from './region-geometry.ts'

/** Cells of every `#` in a `rows[y][x]` picture — the readable way to spell a region. */
function cellsOf(rows: readonly string[]): GridCell[] {
  const cells: GridCell[] = []
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') cells.push({ x, y })
  })
  return cells
}

/** Manhattan length of a segment list — the outline's total perimeter in cell edges. */
function perimeter(segments: readonly RegionSegment[]): number {
  return segments.reduce((sum, s) => sum + Math.abs(s.x1 - s.x0) + Math.abs(s.y1 - s.y0), 0)
}

/** Structural membership by hand — the unit runner has no deep-contains matcher. */
function hasSegment(segments: readonly RegionSegment[], wanted: RegionSegment): boolean {
  return segments.some((s) => s.x0 === wanted.x0 && s.y0 === wanted.y0 && s.x1 === wanted.x1 && s.y1 === wanted.y1)
}

/** Count of unit boundary edges computed the slow way, cell by cell, for cross-checking. */
function unitEdgeCount(cells: readonly GridCell[]): number {
  const keys = new Set(cells.map((c) => `${c.x},${c.y}`))
  let count = 0
  for (const { x, y } of cells) {
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (!keys.has(`${nx},${ny}`)) count++
    }
  }
  return count
}

export default async () => {
  await describe('computeRegionBounds', async () => {
    await it('returns null for an empty region', async () => {
      expect(computeRegionBounds([])).toBe(null)
    })

    await it('spans the extreme cells inclusively', async () => {
      expect(computeRegionBounds([{ x: 3, y: 5 }])).toStrictEqual({ x: 3, y: 5, width: 1, height: 1 })
      expect(
        computeRegionBounds([
          { x: 4, y: 1 },
          { x: 2, y: 7 },
          { x: 9, y: 3 },
        ]),
      ).toStrictEqual({ x: 2, y: 1, width: 8, height: 7 })
    })
  })

  await describe('computeRegionRuns', async () => {
    await it('merges consecutive cells per row and orders rows ascending', async () => {
      // Rows given out of order and cells within a row out of order —
      // the flood fill returns cells in traversal order, never sorted.
      const cells = cellsOf(['##.#', '....', '.###'])
      const shuffled = [cells[3], cells[0], cells[5], cells[4], cells[1], cells[2]]
      expect(computeRegionRuns(shuffled)).toStrictEqual([
        { y: 0, x0: 0, x1: 2 },
        { y: 0, x0: 3, x1: 4 },
        { y: 2, x0: 1, x1: 4 },
      ])
    })

    await it('collapses a duplicated cell into its run', async () => {
      expect(
        computeRegionRuns([
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 1, y: 0 },
        ]),
      ).toStrictEqual([{ y: 0, x0: 1, x1: 3 }])
    })

    await it('covers a uniform grid with one run per row', async () => {
      const cells = cellsOf(['#####', '#####', '#####'])
      expect(computeRegionRuns(cells)).toStrictEqual([
        { y: 0, x0: 0, x1: 5 },
        { y: 1, x0: 0, x1: 5 },
        { y: 2, x0: 0, x1: 5 },
      ])
    })
  })

  await describe('computeRegionOutline', async () => {
    await it('outlines a single cell with its four edges', async () => {
      expect(computeRegionOutline([{ x: 2, y: 3 }])).toStrictEqual([
        { x0: 2, y0: 3, x1: 3, y1: 3 },
        { x0: 2, y0: 4, x1: 3, y1: 4 },
        { x0: 2, y0: 3, x1: 2, y1: 4 },
        { x0: 3, y0: 3, x1: 3, y1: 4 },
      ])
    })

    await it('merges a rectangle into four segments, one per side', async () => {
      const segments = computeRegionOutline(cellsOf(['###', '###']))
      expect(segments).toStrictEqual([
        { x0: 0, y0: 0, x1: 3, y1: 0 },
        { x0: 0, y0: 2, x1: 3, y1: 2 },
        { x0: 0, y0: 0, x1: 0, y1: 2 },
        { x0: 3, y0: 0, x1: 3, y1: 2 },
      ])
    })

    await it('outlines a hole as its own inner loop', async () => {
      // A 3×3 ring: the centre is NOT in the region, so its four edges
      // are boundary too — the drawn shape must show the island.
      const ring = cellsOf(['###', '#.#', '###'])
      const segments = computeRegionOutline(ring)
      // Outer square (4 sides) + inner square (4 sides).
      expect(segments.length).toBe(8)
      expect(perimeter(segments)).toBe(unitEdgeCount(ring))
      expect(hasSegment(segments, { x0: 1, y0: 1, x1: 2, y1: 1 })).toBe(true)
      expect(hasSegment(segments, { x0: 1, y0: 2, x1: 2, y1: 2 })).toBe(true)
      expect(hasSegment(segments, { x0: 1, y0: 1, x1: 1, y1: 2 })).toBe(true)
      expect(hasSegment(segments, { x0: 2, y0: 1, x1: 2, y1: 2 })).toBe(true)
    })

    await it('keeps a concave bay open on the correct side', async () => {
      // 'U' shape: the bay at (1,0) is outside; its floor edge is the
      // top of cell (1,1), its walls are the inner sides of (0,0)/(2,0).
      const u = cellsOf(['#.#', '###'])
      const segments = computeRegionOutline(u)
      expect(perimeter(segments)).toBe(unitEdgeCount(u))
      expect(hasSegment(segments, { x0: 1, y0: 1, x1: 2, y1: 1 })).toBe(true)
      expect(hasSegment(segments, { x0: 1, y0: 0, x1: 1, y1: 1 })).toBe(true)
      expect(hasSegment(segments, { x0: 2, y0: 0, x1: 2, y1: 1 })).toBe(true)
      // The bay is open at the top: no segment lies on line y = 0 between x = 1 and 2.
      expect(segments.some((s) => s.y0 === 0 && s.y1 === 0 && s.x0 <= 1 && s.x1 >= 2)).toBe(false)
    })

    await it('joins a top edge and a bottom edge that meet on the same grid line', async () => {
      // Row 0 covers x < 2, row 1 covers x ≥ 2: on grid line y = 1 the
      // bottom of (0,0)(1,0) and the top of (2,1)(3,1) are adjacent and
      // draw as ONE segment — which side the region is on does not
      // matter for drawing.
      const step = cellsOf(['##..', '..##'])
      const segments = computeRegionOutline(step)
      expect(hasSegment(segments, { x0: 0, y0: 1, x1: 4, y1: 1 })).toBe(true)
      expect(perimeter(segments)).toBe(unitEdgeCount(step))
    })

    await it('has no segments for an empty region', async () => {
      expect(computeRegionOutline([])).toStrictEqual([])
    })
  })
}
