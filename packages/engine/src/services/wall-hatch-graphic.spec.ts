import { describe, expect, it } from '@gjsify/unit'
import { BoundingBox, Color, type ExcaliburGraphicsContext, type Vector } from 'excalibur'

import type { RegionView } from './region-graphic.ts'
import { WALL_HATCH_LINE_WIDTH } from './wall-hatch.ts'
import { type WallHatchCell, WallHatchGraphic } from './wall-hatch-graphic.ts'

interface DrawnLine {
  x0: number
  y0: number
  x1: number
  y1: number
  thickness: number
}

/**
 * A context that records the lines the graphic strokes. `Graphic.draw`
 * brackets `_drawImage` with save / translate / multiply / restore and
 * writes `opacity`, so those exist as no-ops.
 */
function recordingContext(): { ctx: ExcaliburGraphicsContext; lines: DrawnLine[] } {
  const lines: DrawnLine[] = []
  const ctx = {
    opacity: 1,
    tint: null,
    save() {},
    restore() {},
    translate() {},
    multiply() {},
    drawLine(start: Vector, end: Vector, _color: Color, thickness: number) {
      lines.push({ x0: start.x, y0: start.y, x1: end.x, y1: end.y, thickness })
    },
  } as unknown as ExcaliburGraphicsContext
  return { ctx, lines }
}

/** One hatch line per cell, running across the cell's own 16 px box. */
function cellAt(x: number, y: number): WallHatchCell {
  return {
    x,
    y,
    segments: [{ x0: x * 16, y0: y * 16, x1: x * 16 + 16, y1: y * 16 + 16 }],
  }
}

function graphicFor(cells: readonly WallHatchCell[], view: () => RegionView | null): WallHatchGraphic {
  return new WallHatchGraphic({
    cells,
    columns: 100,
    rows: 100,
    tileWidth: 16,
    tileHeight: 16,
    color: Color.Red,
    lineWidth: WALL_HATCH_LINE_WIDTH,
    view,
  })
}

export default async () => {
  await describe('WallHatchGraphic', async () => {
    await it('sizes itself to the map and counts its lines', async () => {
      const g = graphicFor([cellAt(0, 0), cellAt(1, 0)], () => null)
      expect(g.width).toBe(1600)
      expect(g.height).toBe(1600)
      expect(g.lineCount).toBe(2)
    })

    await it('strokes every segment in local pixels when there is no view', async () => {
      const g = graphicFor([cellAt(2, 3)], () => null)
      const { ctx, lines } = recordingContext()
      g.draw(ctx, 0, 0)
      expect(lines.length).toBe(1)
      expect(lines[0].x0).toBe(32)
      expect(lines[0].y0).toBe(48)
      expect(lines[0].x1).toBe(48)
      expect(lines[0].y1).toBe(64)
    })

    await it('draws only the cells the view covers, padded by a cell', async () => {
      // A 1 × 100 column of hatched cells; the view shows world y 400 … 560 (rows 25 … 35).
      const cells = Array.from({ length: 100 }, (_, y) => cellAt(0, y))
      const g = graphicFor(cells, () => ({ bounds: new BoundingBox(0, 400, 16, 560), zoom: 1 }))
      const { ctx, lines } = recordingContext()
      g.draw(ctx, 0, 0)
      const rows = lines.map((l) => l.y0 / 16)
      expect(Math.min(...rows)).toBe(24)
      expect(Math.max(...rows)).toBe(36)
      expect(g.lineCount).toBe(100)
    })

    await it('translates the world view through the actor position', async () => {
      // Cells (100,100)…(101,100) — world (1600,1600) while the map sits
      // at the origin, world (3200,3200) once the actor is moved there.
      let view: RegionView = { bounds: new BoundingBox(1590, 1590, 1640, 1620), zoom: 1 }
      const g = graphicFor([cellAt(100, 100), cellAt(101, 100)], () => view)
      const drawCount = () => {
        const { ctx, lines } = recordingContext()
        g.draw(ctx, 0, 0)
        return lines.length
      }
      expect(drawCount()).toBe(2)
      // The same world view now looks at the map's top-left corner.
      g.worldOrigin = { x: 1600, y: 1600 } as Vector
      expect(drawCount()).toBe(0)
      view = { bounds: new BoundingBox(3190, 3190, 3240, 3220), zoom: 1 }
      expect(drawCount()).toBe(2)
    })

    await it('keeps the stroke lineWidth screen pixels wide at any zoom', async () => {
      const g = graphicFor([cellAt(0, 0)], () => ({ bounds: null, zoom: 0.25 }))
      const { ctx, lines } = recordingContext()
      g.draw(ctx, 0, 0)
      expect(lines[0].thickness).toBe(4)
    })

    await it('clones with the same lines and origin', async () => {
      const g = graphicFor([cellAt(1, 1), cellAt(2, 2)], () => null)
      g.worldOrigin = { x: 48, y: 64 } as Vector
      const copy = g.clone()
      expect(copy.lineCount).toBe(2)
      expect(copy.worldOrigin.x).toBe(48)
      expect(copy.worldOrigin.y).toBe(64)
      expect(copy.width).toBe(1600)
    })
  })
}
