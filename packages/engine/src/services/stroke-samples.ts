/**
 * The walk that turns a handful of reported pointer positions back into
 * a continuous stroke.
 *
 * A pointer gesture reports where the finger IS, not where it has been,
 * so a fast flick across a row delivers a few widely-spaced positions
 * and the cells between them would stay untouched. Both brushes in this
 * app have that problem and must solve it identically — the palette's
 * Wall brush (`TilePalette`, which marks collision cells inside one
 * widget) and the canvas stroke of TERRAIN.md §6.3 (`TileEditorSystem`,
 * which paints map cells). The math lives here, in the Excalibur-free
 * core, so neither can drift from the other.
 */

import type { Point2 } from './tile-geometry.ts'

/**
 * Default distance between two samples, in pixels. Half the smallest
 * swatch the palette offers (`tile-size` is capped at 12 from below),
 * so a palette stroke can never jump a cell between two frames.
 *
 * The map canvas passes its OWN step instead: a map tile's on-screen
 * size depends on the camera zoom, and at zoom 0.3 a 16 px tile is
 * under 5 px wide — a fixed 6 px step would skip cells exactly where
 * the user is painting the broadest shapes.
 */
export const BRUSH_SAMPLE_STEP = 6

/**
 * The points a brush stroke from `from` to `to` passes through, at most
 * `step` pixels apart, `to` always last.
 *
 * Steps are counted along the segment's LENGTH, not its longer axis, so
 * a diagonal advances both axes together instead of staircasing. A zero
 * or negative `step` is treated as one pixel rather than dividing by
 * zero.
 */
export function strokeSamples(from: Point2, to: Point2, step: number = BRUSH_SAMPLE_STEP): Point2[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, step)))
  const points: Point2[] = []
  for (let i = 1; i <= steps; i++) {
    points.push({ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps })
  }
  return points
}
