import Gdk from '@girs/gdk-4.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import type Gtk from '@girs/gtk-4.0'

import { type HatchSegment, WALL_HATCH_ALPHA, WALL_HATCH_COLOR, WALL_HATCH_LINE_WIDTH } from '@pixelrpg/engine'

/**
 * Painting the "Show walls" hatch into a `Gtk.Snapshot`.
 *
 * The geometry is not here: it comes from the engine's pure
 * `wallHatchSegments`, which the map renderer consumes too. This module
 * is only the GTK half — the colour lookup and the stroke idiom — so a
 * widget that wants hatching is one call, and the sheet and the palette
 * cannot end up drawing it differently.
 */

/**
 * `--error-color` as this widget's theme defines it, at
 * {@link WALL_HATCH_ALPHA}.
 *
 * Looked up on the style context rather than hardcoded so the hatch
 * follows a recoloured or high-contrast theme; {@link WALL_HATCH_COLOR}
 * is the fallback, and it is the same literal the map renderer uses
 * where there is no style context at all.
 */
export function wallHatchColor(widget: Gtk.Widget): Gdk.RGBA {
  const rgba = new Gdk.RGBA()
  try {
    const [found, color] = widget.get_style_context().lookup_color('error_color')
    if (found) {
      color.alpha = WALL_HATCH_ALPHA
      return color
    }
  } catch {
    // GTK4 deprecation may turn lookup_color into a no-op; fall back.
  }
  rgba.parse(WALL_HATCH_COLOR)
  rgba.alpha = WALL_HATCH_ALPHA
  return rgba
}

/**
 * Stroke `segments` in `color`, in the snapshot's current coordinate
 * space.
 *
 * All segments go into ONE path and one stroke node: a 1024-tile sheet
 * with every tile blocked is a few thousand short lines, and that is a
 * difference between one render node and a few thousand.
 */
export function appendWallHatch(
  snapshot: Gtk.Snapshot,
  segments: readonly HatchSegment[],
  color: Gdk.RGBA,
  lineWidth: number = WALL_HATCH_LINE_WIDTH,
): void {
  if (segments.length === 0) return

  const builder = new Gsk.PathBuilder()
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (const segment of segments) {
    builder.move_to(segment.x0, segment.y0)
    builder.line_to(segment.x1, segment.y1)
    left = Math.min(left, segment.x0, segment.x1)
    top = Math.min(top, segment.y0, segment.y1)
    right = Math.max(right, segment.x0, segment.x1)
    bottom = Math.max(bottom, segment.y0, segment.y1)
  }

  // push_stroke clips what follows to the stroked path, so the colour
  // node only has to cover the segments' own extent — grown by the line
  // width, which straddles the geometry it traces.
  const cover = new Graphene.Rect()
  cover.init(left - lineWidth, top - lineWidth, right - left + lineWidth * 2, bottom - top + lineWidth * 2)

  snapshot.push_stroke(builder.to_path(), new Gsk.Stroke(lineWidth))
  snapshot.append_color(color, cover)
  snapshot.pop()
}
