import { describe, expect, it } from '@gjsify/unit'
import { iterateSpriteGrid, type SpriteSetData } from '@pixelrpg/engine'

import { cellOrigin, gridDimensions, type SheetSlicing } from '../cast/sprite-set-import.model.ts'
import { sheetGridOf, spanOfIndex, spanRect, tileIndexAt } from './tile-sheet.geometry.ts'

// Three modules slice the same sheet into the same cells, and each used
// to answer differently once the sheet had gutters: the import dialog
// counted columns as if the grid were tight, the engine's iterator put
// every cell at `col * tileWidth`, and only the palette's geometry read
// `spacing`/`margin` at all. A sheet imported at one answer and drawn at
// another shears by a pixel per column, which looks like a bad download
// rather than a bug.
//
// So the contract is not "each is self-consistent" but "all three agree,
// cell for cell". This spec is the place that can say so, because
// `packages/gjs` may import `@pixelrpg/engine`.

const TILE = 16
const SPACING = 1
const MARGIN = 2
const COLUMNS = 4
const ROWS = 3

/** Exactly the image a 4 × 3 sheet with these gutters needs — no slack. */
const IMAGE_WIDTH = 2 * MARGIN + COLUMNS * TILE + (COLUMNS - 1) * SPACING
const IMAGE_HEIGHT = 2 * MARGIN + ROWS * TILE + (ROWS - 1) * SPACING

const slicing: SheetSlicing = {
  spriteWidth: TILE,
  spriteHeight: TILE,
  spacing: SPACING,
  margin: MARGIN,
}

const layout = {
  columns: COLUMNS,
  rows: ROWS,
  spriteWidth: TILE,
  spriteHeight: TILE,
  spacing: SPACING,
  margin: MARGIN,
}

const sheetData = { ...layout, sprites: [] } as unknown as SpriteSetData

export default async () => {
  await describe('sheet slicers agree', async () => {
    await it('derives the authored grid back out of the image size', async () => {
      // The dialog's count is what WRITES `columns`/`rows` into the
      // descriptor the other two then read, so it has to round-trip.
      expect(gridDimensions(IMAGE_WIDTH, IMAGE_HEIGHT, slicing)).toStrictEqual({
        columns: COLUMNS,
        rows: ROWS,
      })
    })

    await it('puts every cell at the same origin in all three slicers', async () => {
      const grid = gridDimensions(IMAGE_WIDTH, IMAGE_HEIGHT, slicing)
      const sheet = sheetGridOf(layout, IMAGE_WIDTH, IMAGE_HEIGHT)
      const cells = [...iterateSpriteGrid(sheetData)]
      expect(cells).toHaveLength(COLUMNS * ROWS)

      for (const cell of cells) {
        const expected = [MARGIN + cell.col * (TILE + SPACING), MARGIN + cell.row * (TILE + SPACING)]

        // Engine iterator.
        expect([cell.x, cell.y]).toStrictEqual(expected)
        // Import dialog's preview.
        expect(cellOrigin(cell.index, grid, slicing)).toStrictEqual(expected)
        // Palette geometry, at scale 1 so widget space is source space.
        const rect = spanRect(sheet, 1, spanOfIndex(sheet, cell.index))
        expect([rect?.x, rect?.y]).toStrictEqual(expected)
        expect([rect?.width, rect?.height]).toStrictEqual([TILE, TILE])
      }
    })

    await it('hit-tests each cell back to the index the others gave it', async () => {
      const sheet = sheetGridOf(layout, IMAGE_WIDTH, IMAGE_HEIGHT)
      for (const cell of iterateSpriteGrid(sheetData)) {
        // Both corners of the cell, inset by half a pixel so the
        // bottom-right one can't fall into the next gutter.
        expect(tileIndexAt(sheet, 1, cell.x, cell.y)).toBe(cell.index)
        expect(tileIndexAt(sheet, 1, cell.x + TILE - 0.5, cell.y + TILE - 0.5)).toBe(cell.index)
      }
    })

    await it('reports a point in a gutter as no tile at all', async () => {
      const sheet = sheetGridOf(layout, IMAGE_WIDTH, IMAGE_HEIGHT)
      // The 1 px column between cell 0 and cell 1.
      expect(tileIndexAt(sheet, 1, MARGIN + TILE, MARGIN + 1)).toBe(null)
      // The outer margin.
      expect(tileIndexAt(sheet, 1, 0, 0)).toBe(null)
    })

    await it('still agrees on a tight sheet', async () => {
      const tight = { columns: 3, rows: 2, spriteWidth: TILE, spriteHeight: TILE }
      const width = 3 * TILE
      const height = 2 * TILE
      const grid = gridDimensions(width, height, tight)
      const sheet = sheetGridOf(tight, width, height)
      expect(grid).toStrictEqual({ columns: 3, rows: 2 })
      for (const cell of iterateSpriteGrid({ ...tight, sprites: [] } as unknown as SpriteSetData)) {
        expect(cellOrigin(cell.index, grid, tight)).toStrictEqual([cell.x, cell.y])
        expect(tileIndexAt(sheet, 1, cell.x, cell.y)).toBe(cell.index)
      }
    })
  })
}
