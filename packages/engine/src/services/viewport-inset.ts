import type { Point2 } from './tile-geometry.ts'

/**
 * Screen-space edges of the canvas that are covered by host chrome —
 * today only the phone's bottom sheet at its Half detent.
 *
 * An inset is NOT a canvas resize. Resizing the GL surface on every drag
 * frame costs a reallocation and a camera jump per frame; the canvas
 * keeps its size and the camera simply aims at the centre of the part
 * that is still visible.
 */
export interface ViewportInset {
  /** Px of canvas hidden along the bottom edge. */
  readonly bottom: number
}

export const EMPTY_VIEWPORT_INSET: ViewportInset = { bottom: 0 }

/** Reject NaN / negative / non-finite insets at the boundary. */
export function normalizeViewportInset(inset: Partial<ViewportInset> | null | undefined): ViewportInset {
  const bottom = inset?.bottom
  if (typeof bottom !== 'number' || !Number.isFinite(bottom) || bottom <= 0) return EMPTY_VIEWPORT_INSET
  return { bottom }
}

/**
 * Where the camera has to sit for `point` to land in the middle of the
 * UNCOVERED part of the canvas.
 *
 * Hiding `bottom` px along the lower edge moves the visible centre up by
 * half of that, so the camera moves DOWN in world space by the same
 * amount — divided by the zoom, because the inset is measured in screen
 * px and the camera lives in world units.
 */
export function insetCameraTarget(point: Point2, inset: ViewportInset, zoom: number): Point2 {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  return { x: point.x, y: point.y + inset.bottom / (2 * scale) }
}
