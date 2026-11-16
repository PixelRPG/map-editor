import { type BoundingBox, type Color, type ExcaliburGraphicsContext, Graphic, Vector, vec } from 'excalibur'
import type { HatchSegment } from './wall-hatch.ts'
import type { RegionView } from './region-graphic.ts'

/**
 * The map-side half of "Show walls": an Excalibur graphic that strokes
 * the hatch lines of every blocking tile on the open map.
 *
 * Why a `Graphic` rather than the GTK path the sheet and the palette
 * use — those are widgets, the map is Excalibur's canvas, and the only
 * thing that can draw over a tilemap in world coordinates is a graphic
 * on an actor. The geometry itself is shared: the lines come from
 * `wall-hatch.ts`, so all three surfaces hatch the same shapes.
 *
 * Modelled on {@link RegionGraphic}, for the same two reasons. The
 * hatch of a full map is large — kokiri-forest's blocked tiles come to
 * a few thousand lines — so it is precomputed once per map revision
 * into local pixel space and drawn with one `drawLine` per visible
 * line, with no texture and no allocation per frame. And lines are
 * grouped by their tile, so a frame tests the viewport once per tile
 * instead of once per line.
 *
 * `lineWidth` is in SCREEN pixels: a fixed world width turns sub-pixel
 * when zoomed out and, with no antialiasing, rasterises into a dotted
 * mess — the lesson {@link RegionGraphic} already records for its
 * outline.
 */

/** The hatch of one tile: its cell coordinates plus the lines inside it. */
export interface WallHatchCell {
  readonly x: number
  readonly y: number
  readonly segments: readonly HatchSegment[]
}

export interface WallHatchGraphicOptions {
  /** Hatched tiles; every segment in SURFACE pixels relative to the map's top-left corner. */
  readonly cells: readonly WallHatchCell[]
  /** Map extent in tiles — the graphic's bounds, so Excalibur culls it correctly. */
  readonly columns: number
  readonly rows: number
  readonly tileWidth: number
  readonly tileHeight: number
  /** Stroke colour, alpha included. */
  readonly color: Color
  /** Stroke width in SCREEN pixels. */
  readonly lineWidth: number
  /** The camera's view, read on every draw; `null` draws everything at zoom 1. */
  readonly view: () => RegionView | null
}

interface Line {
  readonly start: Vector
  readonly end: Vector
}

interface Cell {
  readonly x: number
  readonly y: number
  readonly lines: readonly Line[]
}

export class WallHatchGraphic extends Graphic {
  /** World position of the graphic's top-left corner — set by the owner whenever it moves the actor. */
  worldOrigin: Vector = Vector.Zero

  private readonly options: WallHatchGraphicOptions
  private readonly cells: readonly Cell[]

  constructor(options: WallHatchGraphicOptions) {
    super({ width: options.columns * options.tileWidth, height: options.rows * options.tileHeight })
    this.options = options
    this.cells = options.cells.map((cell) => ({
      x: cell.x,
      y: cell.y,
      lines: cell.segments.map((s) => ({ start: vec(s.x0, s.y0), end: vec(s.x1, s.y1) })),
    }))
  }

  /** How many lines this graphic strokes when fully on screen — for tests and diagnostics. */
  get lineCount(): number {
    return this.cells.reduce((total, cell) => total + cell.lines.length, 0)
  }

  protected _drawImage(ctx: ExcaliburGraphicsContext, _x: number, _y: number): void {
    const camera = this.options.view()
    const view = this.visibleCellRange(camera?.bounds ?? null)
    const { color } = this.options
    const lineWidth = this.options.lineWidth / (camera?.zoom || 1)
    for (const cell of this.cells) {
      if (view && (cell.x < view.left || cell.x > view.right || cell.y < view.top || cell.y > view.bottom)) {
        continue
      }
      for (const line of cell.lines) {
        ctx.drawLine(line.start, line.end, color, lineWidth)
      }
    }
  }

  clone(): WallHatchGraphic {
    const copy = new WallHatchGraphic(this.options)
    copy.worldOrigin = this.worldOrigin
    return copy
  }

  /**
   * The on-screen rectangle in cell coordinates, or `null` to draw
   * everything. Padded by one cell so a line straddling the edge is
   * never clipped away.
   */
  private visibleCellRange(
    world: BoundingBox | null,
  ): { left: number; top: number; right: number; bottom: number } | null {
    if (!world) return null
    const { tileWidth, tileHeight } = this.options
    return {
      left: Math.floor((world.left - this.worldOrigin.x) / tileWidth) - 1,
      top: Math.floor((world.top - this.worldOrigin.y) / tileHeight) - 1,
      right: Math.ceil((world.right - this.worldOrigin.x) / tileWidth) + 1,
      bottom: Math.ceil((world.bottom - this.worldOrigin.y) / tileHeight) + 1,
    }
  }
}
