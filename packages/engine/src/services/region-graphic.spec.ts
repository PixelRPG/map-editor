import { describe, expect, it } from '@gjsify/unit'
import { BoundingBox, Color, type ExcaliburGraphicsContext, type Vector } from 'excalibur'

import { RegionGraphic, type RegionView } from './region-graphic.ts'

interface Drawn {
  rects: Array<{ x: number; y: number; width: number; height: number }>
  lines: Array<{ x0: number; y0: number; x1: number; y1: number; thickness: number }>
}

/**
 * A context that records what the graphic asks it to draw. `Graphic.draw`
 * brackets `_drawImage` with save / translate / multiply / restore and
 * writes `opacity`, so those exist as no-ops.
 */
function recordingContext(): { ctx: ExcaliburGraphicsContext; drawn: Drawn } {
  const drawn: Drawn = { rects: [], lines: [] }
  const ctx = {
    opacity: 1,
    tint: null,
    save() {},
    restore() {},
    translate() {},
    multiply() {},
    drawRectangle(pos: Vector, width: number, height: number) {
      drawn.rects.push({ x: pos.x, y: pos.y, width, height })
    },
    drawLine(start: Vector, end: Vector, _color: Color, thickness: number) {
      drawn.lines.push({ x0: start.x, y0: start.y, x1: end.x, y1: end.y, thickness })
    },
  } as unknown as ExcaliburGraphicsContext
  return { ctx, drawn }
}

function graphicFor(cells: Array<{ x: number; y: number }>, view: () => RegionView | null, tint = true): RegionGraphic {
  return new RegionGraphic({
    cells,
    tileWidth: 16,
    tileHeight: 16,
    tintColor: tint ? Color.Green : null,
    strokeColor: Color.Green,
    lineWidth: 2,
    view,
  })
}

export default async () => {
  await describe('RegionGraphic', async () => {
    await it('draws one rectangle per row run and one line per outline segment, in local pixels', async () => {
      // A 2×2 block with its top-right cell missing: rows → 2 runs, outline → 6 segments.
      const g = graphicFor(
        [
          { x: 5, y: 7 },
          { x: 5, y: 8 },
          { x: 6, y: 8 },
        ],
        () => null,
      )
      expect(g.cellBounds).toStrictEqual({ x: 5, y: 7, width: 2, height: 2 })
      expect(g.width).toBe(32)
      expect(g.height).toBe(32)
      const { ctx, drawn } = recordingContext()
      g.draw(ctx, 0, 0)
      expect(drawn.rects).toStrictEqual([
        { x: 0, y: 0, width: 16, height: 16 },
        { x: 0, y: 16, width: 32, height: 16 },
      ])
      expect(drawn.lines.length).toBe(6)
      // The step edge: bottom of the missing cell = top of (6,8), from local (16,16) to (32,16).
      expect(drawn.lines.some((l) => l.x0 === 16 && l.y0 === 16 && l.x1 === 32 && l.y1 === 16)).toBe(true)
    })

    await it('draws only what the view bounds cover, padded by a cell', async () => {
      // A 1 × 100 column of cells; the view shows world y 400 … 560 (rows 25 … 35).
      const cells = Array.from({ length: 100 }, (_, y) => ({ x: 0, y }))
      const g = graphicFor(cells, () => ({ bounds: new BoundingBox(0, 400, 16, 560), zoom: 1 }))
      const { ctx, drawn } = recordingContext()
      g.draw(ctx, 0, 0)
      const rows = drawn.rects.map((r) => r.y / 16)
      expect(Math.min(...rows)).toBe(24)
      expect(Math.max(...rows)).toBe(35) // bottom is exclusive
      // The two long vertical edges are single segments spanning the whole column: never culled.
      expect(drawn.lines.some((l) => l.x0 === 0 && l.x1 === 0 && l.y0 === 0 && l.y1 === 1600)).toBe(true)
      expect(drawn.lines.some((l) => l.x0 === 16 && l.x1 === 16 && l.y0 === 0 && l.y1 === 1600)).toBe(true)
      // The far end caps are out of view.
      expect(drawn.lines.some((l) => l.y0 === 1600 && l.y1 === 1600)).toBe(false)
      expect(drawn.lines.some((l) => l.y0 === 0 && l.y1 === 0)).toBe(false)
    })

    await it('keeps the outline lineWidth screen pixels wide at any zoom', async () => {
      const g = graphicFor([{ x: 0, y: 0 }], () => ({ bounds: null, zoom: 0.4 }), false)
      const { ctx, drawn } = recordingContext()
      g.draw(ctx, 0, 0)
      expect(drawn.rects.length).toBe(0)
      expect(drawn.lines.length).toBe(4)
      expect(drawn.lines[0].thickness).toBe(5)
    })

    await it('translates the view into cell space from its world origin', async () => {
      // Region at cells (100,100)…(101,100), actor placed at world (1600,1600); a view
      // around world (1600,1600) must still draw both cells.
      const g = graphicFor(
        [
          { x: 100, y: 100 },
          { x: 101, y: 100 },
        ],
        () => ({ bounds: new BoundingBox(1590, 1590, 1640, 1620), zoom: 1 }),
      )
      g.worldOrigin = { x: 1600, y: 1600 } as Vector
      const { ctx, drawn } = recordingContext()
      g.draw(ctx, 0, 0)
      expect(drawn.rects.length).toBe(1)
      expect(drawn.rects[0].width).toBe(32)
    })
  })
}
