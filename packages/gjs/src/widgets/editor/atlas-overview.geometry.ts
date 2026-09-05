// Pure fit-and-map math for {@link AtlasOverview}: how the whole atlas
// content box is scaled into the minimap widget, and where one scene (or
// the viewport marker) lands inside it. GTK-free so it can be unit-tested
// — the overview subclasses `Gtk.Widget` and only feeds these numbers to
// `Graphene.Rect`.

/** One rectangle in atlas-surface coordinates. */
export interface OverviewRect {
  x: number
  y: number
  w: number
  h: number
}

/** Uniform scale plus the centring offsets that map content → widget. */
export interface OverviewTransform {
  scale: number
  offsetX: number
  offsetY: number
}

/**
 * Fit the whole `contentW × contentH` box into a `widgetW × widgetH`
 * widget, preserving aspect and centring the leftover on the
 * unconstrained axis.
 *
 * Returns `null` when there is nothing to draw — a zero widget
 * allocation (pre-allocation) or a zero content box (no scenes yet).
 * Both would otherwise divide by zero and produce a NaN transform that
 * silently paints nothing anyway; returning `null` makes the caller's
 * early-out explicit and testable.
 */
export function overviewTransform(
  widgetW: number,
  widgetH: number,
  contentW: number,
  contentH: number,
): OverviewTransform | null {
  if (widgetW <= 0 || widgetH <= 0 || contentW <= 0 || contentH <= 0) return null
  const scale = Math.min(widgetW / contentW, widgetH / contentH)
  return {
    scale,
    offsetX: (widgetW - contentW * scale) / 2,
    offsetY: (widgetH - contentH * scale) / 2,
  }
}

/**
 * Place `rect` inside the widget under `transform`. Width and height are
 * floored at one pixel so a scene that scales below a pixel still shows
 * as a dot instead of vanishing — a minimap that loses its smallest
 * scenes misrepresents the world.
 */
export function mapOverviewRect(rect: OverviewRect, transform: OverviewTransform): OverviewRect {
  return {
    x: transform.offsetX + rect.x * transform.scale,
    y: transform.offsetY + rect.y * transform.scale,
    w: Math.max(1, rect.w * transform.scale),
    h: Math.max(1, rect.h * transform.scale),
  }
}
