/**
 * Geometry behind "Show walls" — the diagonal hatching that marks every
 * blocking shape on the tileset sheet, in the palette and on the map.
 *
 * Three renderers want the same picture and none of them can share a
 * drawing API: the sheet and the palette are `Gsk.PathBuilder` inside a
 * `vfunc_snapshot`, the map is `ctx.drawLine` inside an Excalibur
 * `Graphic`. What they CAN share is the numbers, so the whole decision
 * — which part of a tile blocks, and where the hatch lines fall inside
 * it — lives here as plain arithmetic and is unit-tested without a
 * widget or a scene.
 *
 * Hatch phase is anchored to the coordinate origin rather than to each
 * rectangle, so two blocked tiles that touch continue each other's
 * lines instead of meeting at a seam. That only holds when the caller
 * passes rectangles in one shared space — which every renderer does,
 * because it draws a whole surface in one pass.
 */

import type { ColliderShape } from '../types/data/index.ts'
import type { TileCollisionRef } from '../resource/tile-collision.ts'

/** Distance between two hatch lines, in surface pixels. */
export const WALL_HATCH_SPACING = 6

/** Hatch stroke width, in surface pixels. */
export const WALL_HATCH_LINE_WIDTH = 1

/**
 * Opacity of the hatch, from §6.4: `--error-color` at 40 %. Low enough
 * that the artwork underneath stays readable while the overlay is on.
 */
export const WALL_HATCH_ALPHA = 0.4

/**
 * Adwaita's `--error-color`. The GTK renderers look the real one up on
 * the style context and fall back to this; Excalibur has no style
 * context, so on the map this IS the colour.
 */
export const WALL_HATCH_COLOR = '#e01b24'

/** An axis-aligned rectangle, top-left anchored. */
export interface HatchRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** One hatch line, from (`x0`, `y0`) to (`x1`, `y1`). */
export interface HatchSegment {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** The bounding rectangle of one collider shape, in tile-local pixels. */
function shapeRect(shape: ColliderShape, tileWidth: number, tileHeight: number): HatchRect | null {
  if (shape.type === 'rectangle') {
    return { x: shape.offset?.x ?? 0, y: shape.offset?.y ?? 0, width: shape.width, height: shape.height }
  }
  if (shape.type === 'circle') {
    const cx = shape.offset?.x ?? tileWidth / 2
    const cy = shape.offset?.y ?? tileHeight / 2
    return { x: cx - shape.radius, y: cy - shape.radius, width: shape.radius * 2, height: shape.radius * 2 }
  }
  if (shape.points.length === 0) return null
  const xs = shape.points.map((p) => p.x)
  const ys = shape.points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/**
 * Which parts of a tile block, in tile-local pixels — the rectangles
 * the hatch covers.
 *
 * Mirrors the engine's own collider rules so the overlay cannot claim
 * something the hero walks through: not solid blocks nothing whatever
 * shapes it carries, and solid WITHOUT shapes blocks the whole tile
 * (Excalibur meshes it from the tile bounds).
 *
 * A circle or polygon is reported as its bounding box. The overlay is
 * a "where are my walls?" hint at tileset zoom, where a 16 px tile is
 * a handful of screen pixels and the exact outline of a polygon is not
 * the question being asked; the Full-view shape editor shows the real
 * shape.
 */
export function wallRectsOf(
  ref: TileCollisionRef | null | undefined,
  tileWidth: number,
  tileHeight: number,
): HatchRect[] {
  if (!ref?.solid) return []
  const colliders = ref.colliders
  if (!colliders || colliders.length === 0) return [{ x: 0, y: 0, width: tileWidth, height: tileHeight }]
  const rects: HatchRect[] = []
  for (const shape of colliders) {
    const rect = shapeRect(shape, tileWidth, tileHeight)
    if (rect && rect.width > 0 && rect.height > 0) rects.push(rect)
  }
  return rects
}

/**
 * The hatch lines covering `rect`, each already clipped to it.
 *
 * Lines run down-right at 45° (`x - y = c`) and `c` steps through
 * multiples of `spacing` measured from the coordinate origin — see the
 * module comment on why the phase is global and not per-rectangle.
 */
export function hatchSegments(rect: HatchRect, spacing: number = WALL_HATCH_SPACING): HatchSegment[] {
  const segments: HatchSegment[] = []
  if (rect.width <= 0 || rect.height <= 0 || spacing <= 0) return segments

  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  const last = right - top
  for (let c = Math.ceil((left - bottom) / spacing) * spacing; c < last; c += spacing) {
    const yStart = Math.max(top, left - c)
    const yEnd = Math.min(bottom, right - c)
    if (yEnd <= yStart) continue
    segments.push({ x0: yStart + c, y0: yStart, x1: yEnd + c, y1: yEnd })
  }
  return segments
}

/**
 * The hatch for one tile drawn at `cell` on the target surface.
 *
 * `tileWidth`/`tileHeight` are the sprite's own pixel size, `cell` is
 * where that tile lands on the surface — a scaled sheet cell, a palette
 * swatch, or a map tile in world pixels. The blocking rectangles are
 * scaled into the cell before they are hatched, so a half-tile wall
 * stays a half cell at every zoom.
 */
export function wallHatchSegments(
  ref: TileCollisionRef | null | undefined,
  tileWidth: number,
  tileHeight: number,
  cell: HatchRect,
  spacing: number = WALL_HATCH_SPACING,
): HatchSegment[] {
  if (tileWidth <= 0 || tileHeight <= 0) return []
  const scaleX = cell.width / tileWidth
  const scaleY = cell.height / tileHeight
  const segments: HatchSegment[] = []
  for (const rect of wallRectsOf(ref, tileWidth, tileHeight)) {
    segments.push(
      ...hatchSegments(
        {
          x: cell.x + rect.x * scaleX,
          y: cell.y + rect.y * scaleY,
          width: rect.width * scaleX,
          height: rect.height * scaleY,
        },
        spacing,
      ),
    )
  }
  return segments
}
