import Gdk from '@girs/gdk-4.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import type Gtk from '@girs/gtk-4.0'

import type { ColliderShape } from '@pixelrpg/engine'
import { WALL_HATCH_COLOR } from '@pixelrpg/engine'

/**
 * Painting collider shapes into a `Gtk.Snapshot` for the tile shape
 * editor.
 *
 * Unlike the "Show walls" overlay — which settles for each shape's
 * bounding box because at tileset zoom a 16 px tile is a handful of
 * screen pixels — this draws the real outline: the editor IS the place
 * the exact shape is decided, so a circle has to look like a circle and
 * a concave polygon like its own outline. The magnified tile underneath
 * is the preview of where the hero bumps.
 *
 * Paths are built in WIDGET pixels (tile pixels times the zoom) rather
 * than built once in tile space and scaled by the snapshot, so outline
 * and grid strokes stay one screen pixel wide at every zoom.
 */

/** Opacity of a shape's translucent interior. */
const SHAPE_FILL_ALPHA = 0.3

/** Opacity of a shape's outline. */
const SHAPE_OUTLINE_ALPHA = 0.9

/** Outline width, in widget pixels. */
const SHAPE_OUTLINE_WIDTH = 2

/** Opacity of the hovered pixel's fill, when that pixel blocks. */
const PROBE_FILL_ALPHA = 0.55

/** Opacity of the hovered pixel's outline. */
const PROBE_OUTLINE_ALPHA = 0.8

/** Opacity of the pixel grid, drawn in the widget's foreground colour. */
const GRID_ALPHA = 0.14

/** Below this zoom the per-pixel grid is denser than it is useful. */
const GRID_MIN_ZOOM = 6

/** `--error-color` as this widget's theme defines it, at `alpha`. */
export function shapeColor(widget: Gtk.Widget, alpha: number): Gdk.RGBA {
  const rgba = new Gdk.RGBA()
  try {
    const [found, color] = widget.get_style_context().lookup_color('error_color')
    if (found) {
      color.alpha = alpha
      return color
    }
  } catch {
    // GTK4 deprecation may turn lookup_color into a no-op; fall back.
  }
  rgba.parse(WALL_HATCH_COLOR)
  rgba.alpha = alpha
  return rgba
}

/**
 * The outline of one shape in widget pixels, or `null` for a shape with
 * nothing to draw (a polygon without points).
 *
 * The defaults match {@link shapeBounds}: a circle with no offset sits
 * at the tile's centre, a rectangle with none at its top-left.
 */
export function shapePath(shape: ColliderShape, zoom: number, tileWidth: number, tileHeight: number): Gsk.Path | null {
  const builder = new Gsk.PathBuilder()
  if (shape.type === 'rectangle') {
    const rect = new Graphene.Rect()
    rect.init((shape.offset?.x ?? 0) * zoom, (shape.offset?.y ?? 0) * zoom, shape.width * zoom, shape.height * zoom)
    builder.add_rect(rect)
    return builder.to_path()
  }
  if (shape.type === 'circle') {
    const centre = new Graphene.Point()
    centre.x = (shape.offset?.x ?? tileWidth / 2) * zoom
    centre.y = (shape.offset?.y ?? tileHeight / 2) * zoom
    builder.add_circle(centre, shape.radius * zoom)
    return builder.to_path()
  }
  if (shape.points.length === 0) return null
  const [first, ...rest] = shape.points
  if (!first) return null
  builder.move_to(first.x * zoom, first.y * zoom)
  for (const point of rest) builder.line_to(point.x * zoom, point.y * zoom)
  builder.close()
  return builder.to_path()
}

/**
 * Fill `path` and stroke its outline.
 *
 * `bounds` is the widget's own allocation: `push_fill` / `push_stroke`
 * clip what follows to the path, so the colour node only has to be big
 * enough to cover it, and the canvas is never larger than the tile.
 */
export function appendShapePath(snapshot: Gtk.Snapshot, path: Gsk.Path, bounds: Graphene.Rect, color: Gdk.RGBA): void {
  const fill = color.copy()
  fill.alpha = SHAPE_FILL_ALPHA
  snapshot.push_fill(path, Gsk.FillRule.WINDING)
  snapshot.append_color(fill, bounds)
  snapshot.pop()

  const outline = color.copy()
  outline.alpha = SHAPE_OUTLINE_ALPHA
  snapshot.push_stroke(path, new Gsk.Stroke(SHAPE_OUTLINE_WIDTH))
  snapshot.append_color(outline, bounds)
  snapshot.pop()
}

/**
 * Outline one tile pixel, filled when the hero would bump into it.
 *
 * The readout § 6.4 asks for, in the one form that stays honest at the
 * seams: the answer comes from the pixel's CENTRE, so a circle or a
 * diagonal whose edge cuts this pixel in half says plainly which way it
 * went rather than leaving the author to measure the translucent fill.
 */
export function appendPixelProbe(
  snapshot: Gtk.Snapshot,
  color: Gdk.RGBA,
  zoom: number,
  x: number,
  y: number,
  blocked: boolean,
): void {
  const rect = new Graphene.Rect()
  rect.init(x * zoom, y * zoom, zoom, zoom)
  const builder = new Gsk.PathBuilder()
  builder.add_rect(rect)
  const path = builder.to_path()

  if (blocked) {
    const fill = color.copy()
    fill.alpha = PROBE_FILL_ALPHA
    snapshot.push_fill(path, Gsk.FillRule.WINDING)
    snapshot.append_color(fill, rect)
    snapshot.pop()
  }

  const outline = color.copy()
  outline.alpha = PROBE_OUTLINE_ALPHA
  snapshot.push_stroke(path, new Gsk.Stroke(1))
  snapshot.append_color(outline, rect)
  snapshot.pop()
}

/**
 * Hairlines along the tile's own pixel grid, so the author can see
 * which source pixel a corner snapped to.
 *
 * Skipped below {@link GRID_MIN_ZOOM}, where the lines would be closer
 * together than the artwork they are meant to clarify.
 */
export function appendPixelGrid(
  snapshot: Gtk.Snapshot,
  widget: Gtk.Widget,
  zoom: number,
  tileWidth: number,
  tileHeight: number,
): void {
  if (zoom < GRID_MIN_ZOOM) return
  const color = widget.get_color()
  color.alpha = GRID_ALPHA
  const width = tileWidth * zoom
  const height = tileHeight * zoom

  const builder = new Gsk.PathBuilder()
  for (let x = 1; x < tileWidth; x++) {
    builder.move_to(x * zoom, 0)
    builder.line_to(x * zoom, height)
  }
  for (let y = 1; y < tileHeight; y++) {
    builder.move_to(0, y * zoom)
    builder.line_to(width, y * zoom)
  }

  const bounds = new Graphene.Rect()
  bounds.init(0, 0, width, height)
  snapshot.push_stroke(builder.to_path(), new Gsk.Stroke(1))
  snapshot.append_color(color, bounds)
  snapshot.pop()
}
