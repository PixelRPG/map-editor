/**
 * Geometry of the edit-attribution flash: one outline per cell, and the
 * bounding-box collapse that keeps a bucket fill from spawning an actor
 * per tile. The actor construction itself needs Excalibur's raster stack
 * and is covered by the display specs.
 */

import { describe, expect, it } from '@gjsify/unit'

import { type FlashGrid, MAX_FLASH_CELLS, flashRects } from './edit-flash.ts'

const grid: FlashGrid = { pos: { x: 0, y: 0 }, tileWidth: 16, tileHeight: 16 }

function cells(count: number): Array<{ tileX: number; tileY: number }> {
  return Array.from({ length: count }, (_, i) => ({ tileX: i, tileY: 0 }))
}

export default async () => {
  await describe('edit-flash.flashRects', async () => {
    await it('draws nothing for no cells', async () => {
      expect(flashRects(grid, [])).toStrictEqual([])
    })

    await it('outlines one cell at its centre, one tile big', async () => {
      expect(flashRects(grid, [{ tileX: 2, tileY: 3 }])).toStrictEqual([
        { centre: { x: 40, y: 56 }, width: 16, height: 16 },
      ])
    })

    await it('honours a non-zero tilemap origin', async () => {
      const offset: FlashGrid = { pos: { x: 100, y: 200 }, tileWidth: 16, tileHeight: 16 }
      expect(flashRects(offset, [{ tileX: 0, tileY: 0 }])[0].centre).toStrictEqual({ x: 108, y: 208 })
    })

    await it('keeps one rect per cell up to the cap', async () => {
      expect(flashRects(grid, cells(MAX_FLASH_CELLS)).length).toBe(MAX_FLASH_CELLS)
    })

    await it('collapses past the cap into a single bounding box', async () => {
      const rects = flashRects(grid, cells(MAX_FLASH_CELLS + 1))
      expect(rects.length).toBe(1)
      // 25 cells across one row: 25 tiles wide, one tall, centred between
      // the first and last cell's centres.
      expect(rects[0].width).toBe(25 * 16)
      expect(rects[0].height).toBe(16)
      expect(rects[0].centre.x).toBe(200)
      expect(rects[0].centre.y).toBe(8)
    })

    await it('boxes a scattered region by its extent, not its cell count', async () => {
      const scattered = [...cells(MAX_FLASH_CELLS), { tileX: 3, tileY: 5 }, { tileX: -2, tileY: -1 }]
      const rect = flashRects(grid, scattered)[0]
      // x spans -2..23 (26 tiles), y spans -1..5 (7 tiles).
      expect(rect.width).toBe(26 * 16)
      expect(rect.height).toBe(7 * 16)
    })
  })
}
