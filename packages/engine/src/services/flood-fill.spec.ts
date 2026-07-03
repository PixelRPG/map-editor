import { describe, expect, it } from '@gjsify/unit'

import { computeFloodFillRegion, type GridCell } from './flood-fill.ts'

/** Build a `signatureAt` from a `grid[y][x]` string matrix. */
function signatureFrom(grid: string[][]): (x: number, y: number) => string {
  return (x, y) => grid[y][x]
}

/** Collect a region into a `"x,y"` Set for order-independent membership checks. */
function keys(region: GridCell[]): Set<string> {
  return new Set(region.map((c) => `${c.x},${c.y}`))
}

export default async () => {
  await describe('computeFloodFillRegion', async () => {
    await it('fills the contiguous same-signature region and stops at a barrier', async () => {
      // 'B' cells (2,0)(1,1)(2,1) wall off the top-right; the 'A' region
      // wraps around the bottom to reach (2,2).
      const grid = [
        ['A', 'A', 'B'],
        ['A', 'B', 'B'],
        ['A', 'A', 'A'],
      ]
      const region = computeFloodFillRegion({ x: 0, y: 0 }, { columns: 3, rows: 3 }, signatureFrom(grid))
      const k = keys(region)
      expect(region.length).toBe(6)
      expect(k.has('0,0')).toBe(true)
      expect(k.has('2,2')).toBe(true)
      expect(k.has('1,1')).toBe(false) // barrier
      expect(k.has('2,0')).toBe(false) // barrier
    })

    await it('does not connect diagonally (4-connectivity)', async () => {
      const grid = [
        ['A', 'B'],
        ['B', 'A'],
      ]
      const region = computeFloodFillRegion({ x: 0, y: 0 }, { columns: 2, rows: 2 }, signatureFrom(grid))
      expect(region.length).toBe(1)
      expect(region[0]).toStrictEqual({ x: 0, y: 0 })
    })

    await it('fills an entire uniform grid', async () => {
      const grid = [
        ['A', 'A', 'A'],
        ['A', 'A', 'A'],
        ['A', 'A', 'A'],
      ]
      const region = computeFloodFillRegion({ x: 1, y: 1 }, { columns: 3, rows: 3 }, signatureFrom(grid))
      expect(region.length).toBe(9)
    })

    await it('includes only the origin when all neighbours differ', async () => {
      const grid = [
        ['B', 'B', 'B'],
        ['B', 'A', 'B'],
        ['B', 'B', 'B'],
      ]
      const region = computeFloodFillRegion({ x: 1, y: 1 }, { columns: 3, rows: 3 }, signatureFrom(grid))
      expect(region.length).toBe(1)
      expect(region[0]).toStrictEqual({ x: 1, y: 1 })
    })

    await it('returns an empty region for an out-of-bounds origin', async () => {
      const grid = [['A']]
      const region = computeFloodFillRegion({ x: 5, y: 5 }, { columns: 1, rows: 1 }, signatureFrom(grid))
      expect(region.length).toBe(0)
    })
  })
}
