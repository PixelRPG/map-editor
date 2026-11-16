import { describe, expect, it } from '@gjsify/unit'

import {
  firstIndexOfSpan,
  indicesOfSpan,
  type SheetGrid,
  sheetGridOf,
  sheetScale,
  sheetSize,
  spanBetween,
  spanOfIndex,
  spanRect,
  tileCount,
  tileIndexAt,
  tileRectOf,
} from './tile-sheet.geometry.ts'

/** The shape every shipped spriteset has: no margin, no spacing. */
const tight = (over: Partial<SheetGrid> = {}): SheetGrid => ({
  columns: 4,
  rows: 3,
  tileWidth: 16,
  tileHeight: 16,
  margin: 0,
  spacing: 0,
  imageWidth: 64,
  imageHeight: 48,
  ...over,
})

/** A hand-made sheet with a 2 px border and 1 px gutters. */
const gutters = (): SheetGrid =>
  tight({ margin: 2, spacing: 1, imageWidth: 2 + 4 * 16 + 3 * 1 + 2, imageHeight: 2 + 3 * 16 + 2 * 1 + 2 })

export default async () => {
  await describe('tile-sheet.geometry', async () => {
    await describe('sheetScale', async () => {
      await it('gives 16 px tiles the designed 3x', async () => {
        expect(sheetScale(16, 16)).toBe(3)
      })

      await it('rounds 32 px tiles up to 2x rather than down to 1x', async () => {
        expect(sheetScale(32, 32)).toBe(2)
      })

      await it('leaves tiles already at the target alone', async () => {
        expect(sheetScale(48, 48)).toBe(1)
      })

      await it('scales by the SHORTER axis so neither axis overshoots', async () => {
        expect(sheetScale(16, 32)).toBe(3)
        expect(sheetScale(32, 16)).toBe(3)
      })

      await it('never shrinks a sheet below 1x', async () => {
        expect(sheetScale(128, 128)).toBe(1)
      })

      await it('stays integer for a target that does not divide evenly', async () => {
        expect(sheetScale(16, 16, 50)).toBe(3)
        expect(sheetScale(16, 16, 56)).toBe(4)
      })

      await it('falls back to 1x for a degenerate tile size', async () => {
        expect(sheetScale(0, 16)).toBe(1)
        expect(sheetScale(-16, -16)).toBe(1)
      })
    })

    await describe('sheetGridOf', async () => {
      await it('renames the sprite-set fields onto the grid', async () => {
        expect(sheetGridOf({ columns: 4, rows: 3, spriteWidth: 16, spriteHeight: 16 }, 64, 48)).toStrictEqual(tight())
      })

      await it('defaults the optional margin and spacing to zero', async () => {
        const grid = sheetGridOf({ columns: 1, rows: 1, spriteWidth: 8, spriteHeight: 8 }, 8, 8)
        expect(grid.margin).toBe(0)
        expect(grid.spacing).toBe(0)
      })

      await it('keeps a texture larger than the grid at its real size', async () => {
        const grid = sheetGridOf({ columns: 4, rows: 3, spriteWidth: 16, spriteHeight: 16 }, 66, 50)
        expect(grid.imageWidth).toBe(66)
        expect(grid.imageHeight).toBe(50)
      })
    })

    await describe('tileCount', async () => {
      await it('multiplies the grid out', async () => {
        expect(tileCount(tight())).toBe(12)
      })

      await it('reports nothing for a negative extent instead of a negative count', async () => {
        expect(tileCount(tight({ rows: -3 }))).toBe(0)
      })
    })

    await describe('sheetSize', async () => {
      await it('measures the texture, not the grid', async () => {
        // Two trailing pixels on each axis survive — what the file holds
        // is what the palette shows.
        expect(sheetSize(tight({ imageWidth: 66, imageHeight: 50 }), 3)).toStrictEqual([198, 150])
      })

      await it('scales both axes by the draw factor', async () => {
        expect(sheetSize(tight(), 3)).toStrictEqual([192, 144])
      })
    })

    await describe('tileIndexAt', async () => {
      await it('maps the first tile to index 0', async () => {
        expect(tileIndexAt(tight(), 3, 0, 0)).toBe(0)
        expect(tileIndexAt(tight(), 3, 47, 47)).toBe(0)
      })

      await it('counts across the row before down the column', async () => {
        expect(tileIndexAt(tight(), 3, 48, 0)).toBe(1)
        expect(tileIndexAt(tight(), 3, 0, 48)).toBe(4)
        expect(tileIndexAt(tight(), 3, 48, 48)).toBe(5)
      })

      await it('reaches the last tile', async () => {
        expect(tileIndexAt(tight(), 3, 191, 143)).toBe(11)
      })

      await it('returns null past the grid on either axis', async () => {
        expect(tileIndexAt(tight(), 3, 192, 0)).toBe(null)
        expect(tileIndexAt(tight(), 3, 0, 144)).toBe(null)
      })

      await it('returns null for a negative point', async () => {
        expect(tileIndexAt(tight(), 3, -1, 0)).toBe(null)
        expect(tileIndexAt(tight(), 3, 0, -1)).toBe(null)
      })

      await it('returns null in the margin rather than snapping to tile 0', async () => {
        expect(tileIndexAt(gutters(), 3, 2, 2)).toBe(null)
        expect(tileIndexAt(gutters(), 3, 6, 6)).toBe(0)
      })

      await it('returns null in a gutter between two tiles', async () => {
        // Column 0 spans source x 2..17; x 18 is the 1 px gutter.
        expect(tileIndexAt(gutters(), 1, 17, 6)).toBe(0)
        expect(tileIndexAt(gutters(), 1, 18, 6)).toBe(null)
        expect(tileIndexAt(gutters(), 1, 19, 6)).toBe(1)
      })

      await it('returns null for a non-positive scale instead of dividing by zero', async () => {
        expect(tileIndexAt(tight(), 0, 10, 10)).toBe(null)
      })

      await it('returns null for an empty grid', async () => {
        expect(tileIndexAt(tight({ columns: 0, rows: 0 }), 3, 0, 0)).toBe(null)
      })
    })

    await describe('spanOfIndex', async () => {
      await it('resolves an index to its cell', async () => {
        expect(spanOfIndex(tight(), 6)).toStrictEqual({ col: 2, row: 1, columns: 1, rows: 1 })
      })

      await it('rejects an index off either end', async () => {
        expect(spanOfIndex(tight(), -1)).toBe(null)
        expect(spanOfIndex(tight(), 12)).toBe(null)
      })

      await it('rejects a fractional index', async () => {
        expect(spanOfIndex(tight(), 1.5)).toBe(null)
      })
    })

    await describe('tileRectOf', async () => {
      await it('places a tile at its scaled offset', async () => {
        expect(tileRectOf(tight(), 3, 5)).toStrictEqual({ x: 48, y: 48, width: 48, height: 48 })
      })

      await it('accounts for margin and gutters', async () => {
        expect(tileRectOf(gutters(), 1, 5)).toStrictEqual({ x: 19, y: 19, width: 16, height: 16 })
      })

      await it('returns null for an index off the grid', async () => {
        expect(tileRectOf(tight(), 3, 99)).toBe(null)
      })
    })

    await describe('spanBetween', async () => {
      await it('covers a forward drag', async () => {
        expect(spanBetween(tight(), 0, 5)).toStrictEqual({ col: 0, row: 0, columns: 2, rows: 2 })
      })

      await it('normalises a backward drag to the same block', async () => {
        expect(spanBetween(tight(), 5, 0)).toStrictEqual({ col: 0, row: 0, columns: 2, rows: 2 })
      })

      await it('normalises a drag that crosses only one axis backwards', async () => {
        expect(spanBetween(tight(), 3, 4)).toStrictEqual({ col: 0, row: 0, columns: 4, rows: 2 })
      })

      await it('is one tile when the drag never leaves it', async () => {
        expect(spanBetween(tight(), 7, 7)).toStrictEqual({ col: 3, row: 1, columns: 1, rows: 1 })
      })

      await it('returns null when either end is off the grid', async () => {
        expect(spanBetween(tight(), 0, 12)).toBe(null)
        expect(spanBetween(tight(), -1, 0)).toBe(null)
      })
    })

    await describe('spanRect', async () => {
      await it('spans several tiles in one rectangle', async () => {
        expect(spanRect(tight(), 3, { col: 0, row: 0, columns: 2, rows: 2 })).toStrictEqual({
          x: 0,
          y: 0,
          width: 96,
          height: 96,
        })
      })

      await it('includes the interior gutters but not a trailing one', async () => {
        // Two 16 px tiles with one 1 px gutter between them = 33, not 34.
        expect(spanRect(gutters(), 1, { col: 0, row: 0, columns: 2, rows: 1 })).toStrictEqual({
          x: 2,
          y: 2,
          width: 33,
          height: 16,
        })
      })

      await it('passes a null span through', async () => {
        expect(spanRect(tight(), 3, null)).toBe(null)
      })
    })

    await describe('firstIndexOfSpan', async () => {
      await it('takes the top-left tile', async () => {
        expect(firstIndexOfSpan(tight(), { col: 1, row: 2, columns: 3, rows: 1 })).toBe(9)
      })

      await it('agrees with the drag that produced the span', async () => {
        const grid = tight()
        expect(firstIndexOfSpan(grid, spanBetween(grid, 5, 0))).toBe(0)
      })

      await it('rejects a span anchored off the grid', async () => {
        expect(firstIndexOfSpan(tight(), { col: 4, row: 0, columns: 1, rows: 1 })).toBe(null)
        expect(firstIndexOfSpan(tight(), { col: 0, row: -1, columns: 1, rows: 1 })).toBe(null)
      })

      await it('passes a null span through', async () => {
        expect(firstIndexOfSpan(tight(), null)).toBe(null)
      })
    })

    await describe('indicesOfSpan', async () => {
      await it('lists a block row-major', async () => {
        expect(indicesOfSpan(tight(), { col: 1, row: 0, columns: 2, rows: 2 })).toStrictEqual([1, 2, 5, 6])
      })

      await it('lists a single tile as a one-cell block', async () => {
        const grid = tight()
        expect(indicesOfSpan(grid, spanOfIndex(grid, 7))).toStrictEqual([7])
      })

      await it('agrees with the drag that produced the span', async () => {
        const grid = tight()
        expect(indicesOfSpan(grid, spanBetween(grid, 6, 1))).toStrictEqual([1, 2, 5, 6])
      })

      await it('keeps the block rectangular by holing cells off the grid', async () => {
        expect(indicesOfSpan(tight(), { col: 3, row: 2, columns: 2, rows: 2 })).toStrictEqual([11, -1, -1, -1])
      })

      await it('passes a null or empty span through', async () => {
        expect(indicesOfSpan(tight(), null)).toStrictEqual([])
        expect(indicesOfSpan(tight(), { col: 0, row: 0, columns: 0, rows: 2 })).toStrictEqual([])
      })
    })
  })
}
