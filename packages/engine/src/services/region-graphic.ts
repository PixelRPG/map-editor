import { type BoundingBox, type Color, type ExcaliburGraphicsContext, Graphic, Vector, vec } from 'excalibur'
import type { GridCell } from './flood-fill.ts'
import { computeRegionBounds, computeRegionOutline, computeRegionRuns, type RegionBounds } from './region-geometry.ts'

/**
 * An Excalibur graphic that draws a set of grid cells as a tinted
 * shape with an outline — the fill preview's region and the eraser
 * preview's cell.
 *
 * Why a `Graphic` and not a raster or a `GraphicsGroup`: the region
 * can be the whole map (2816 × 2368 px on kokiri-forest), which is too
 * large to rasterise into a texture on every hover, and a group of one
 * `Rectangle` per cell would be 26,048 members. Drawing straight
 * through the graphics context costs one `drawRectangle` per run and
 * one `drawLine` per outline segment (148 + 4 for the whole map), with
 * no texture at all. Being a real `Graphic` also gives Excalibur's
 * offscreen culling the region's true bounds — a bare `onPostDraw`
 * hook on an actor with no graphic has zero-size bounds and gets
 * culled as soon as the actor's origin leaves the screen.
 *
 * Per frame only the runs and segments inside the view's bounds are
 * drawn: kokiri-forest's heaviest region is 896 runs + 810 segments,
 * and at editor zoom the viewport covers a small fraction of them.
 * The outline is `lineWidth` SCREEN pixels wide at any zoom — a fixed
 * world width turns sub-pixel below zoom 1 (0.8 px at 0.4) and, without
 * antialiasing, rasterises only where it happens to cover a pixel
 * centre, so the border of a zoomed-out map came out dotted.
 */

/** What the graphic reads about the camera on every draw. */
export interface RegionView {
  /** World-space rectangle on screen, or `null` to draw every primitive. */
  readonly bounds: BoundingBox | null
  /** Camera zoom (screen px per world px). */
  readonly zoom: number
}

export interface RegionGraphicOptions {
  readonly cells: readonly GridCell[]
  readonly tileWidth: number
  readonly tileHeight: number
  /** Translucent fill of every cell, or `null` for an outline-only shape. */
  readonly tintColor: Color | null
  readonly strokeColor: Color
  /** Outline width in SCREEN pixels. */
  readonly lineWidth: number
  /**
   * The camera's view, read on every draw; `null` draws everything at
   * zoom 1. The owner keeps {@link RegionGraphic.worldOrigin} in sync
   * with the actor so the graphic can translate the bounds into its own
   * cell space.
   */
  readonly view: () => RegionView | null
}

interface Rect {
  readonly pos: Vector
  readonly width: number
  readonly height: number
  /** Cell-space extent, for the per-frame viewport test. */
  readonly row: number
  readonly x0: number
  readonly x1: number
}

interface Line {
  readonly start: Vector
  readonly end: Vector
  /** Cell-space extent (a segment is axis-aligned, so one axis is a single line). */
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export class RegionGraphic extends Graphic {
  /** The cells this graphic covers — what a preview owner exposes for "is this cell inside?". */
  readonly cells: readonly GridCell[]
  /** Cell-space bounding box; the owner positions its actor at the box's top-left corner. */
  readonly cellBounds: RegionBounds
  /** World position of the graphic's top-left corner — set by the owner whenever it moves the actor. */
  worldOrigin: Vector = Vector.Zero

  private readonly options: RegionGraphicOptions
  private readonly rects: readonly Rect[]
  private readonly lines: readonly Line[]

  constructor(options: RegionGraphicOptions) {
    const cellBounds = computeRegionBounds(options.cells) ?? { x: 0, y: 0, width: 0, height: 0 }
    super({ width: cellBounds.width * options.tileWidth, height: cellBounds.height * options.tileHeight })
    this.options = options
    this.cells = options.cells
    this.cellBounds = cellBounds

    const { tileWidth, tileHeight } = options
    const ox = cellBounds.x
    const oy = cellBounds.y
    // Everything below is precomputed in local pixel space once per
    // region, so a draw is a loop of context calls with no allocation.
    this.rects = options.tintColor
      ? computeRegionRuns(options.cells).map((run) => ({
          pos: vec((run.x0 - ox) * tileWidth, (run.y - oy) * tileHeight),
          width: (run.x1 - run.x0) * tileWidth,
          height: tileHeight,
          row: run.y,
          x0: run.x0,
          x1: run.x1,
        }))
      : []
    this.lines = computeRegionOutline(options.cells).map((s) => ({
      start: vec((s.x0 - ox) * tileWidth, (s.y0 - oy) * tileHeight),
      end: vec((s.x1 - ox) * tileWidth, (s.y1 - oy) * tileHeight),
      x0: s.x0,
      y0: s.y0,
      x1: s.x1,
      y1: s.y1,
    }))
  }

  protected _drawImage(ctx: ExcaliburGraphicsContext, _x: number, _y: number): void {
    const camera = this.options.view()
    const view = this.visibleCellRange(camera?.bounds ?? null)
    const { tintColor, strokeColor } = this.options
    const lineWidth = this.options.lineWidth / (camera?.zoom || 1)
    if (tintColor) {
      for (const rect of this.rects) {
        if (view && (rect.row < view.top || rect.row >= view.bottom || rect.x1 <= view.left || rect.x0 >= view.right)) {
          continue
        }
        ctx.drawRectangle(rect.pos, rect.width, rect.height, tintColor)
      }
    }
    for (const line of this.lines) {
      if (view && (line.x1 < view.left || line.x0 > view.right || line.y1 < view.top || line.y0 > view.bottom)) {
        continue
      }
      ctx.drawLine(line.start, line.end, strokeColor, lineWidth)
    }
  }

  clone(): RegionGraphic {
    const copy = new RegionGraphic(this.options)
    copy.worldOrigin = this.worldOrigin
    return copy
  }

  /**
   * The on-screen rectangle in cell coordinates (half-open on the
   * right/bottom), or `null` to draw everything. Padded by one cell so
   * a stroke straddling the edge is never clipped away.
   */
  private visibleCellRange(
    world: BoundingBox | null,
  ): { left: number; top: number; right: number; bottom: number } | null {
    if (!world) return null
    const { tileWidth, tileHeight } = this.options
    return {
      left: Math.floor((world.left - this.worldOrigin.x) / tileWidth) + this.cellBounds.x - 1,
      top: Math.floor((world.top - this.worldOrigin.y) / tileHeight) + this.cellBounds.y - 1,
      right: Math.ceil((world.right - this.worldOrigin.x) / tileWidth) + this.cellBounds.x + 1,
      bottom: Math.ceil((world.bottom - this.worldOrigin.y) / tileHeight) + this.cellBounds.y + 1,
    }
  }
}
