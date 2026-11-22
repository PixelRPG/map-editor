/**
 * Whole-number scale for the game view.
 *
 * The playing view is pixel art, so one game pixel has to cover a whole
 * number `k` of device pixels in both directions: any other factor
 * resamples the sprites onto a fractional grid and the tiles shimmer or
 * grow seams. Whatever the viewport has left over becomes a border
 * (letterbox) instead of stretching the picture.
 *
 * Everything here works in DEVICE pixels — the widget's logical size
 * times the surface's real scale, fractional included (1.25, 1.5).
 * Excalibur's camera zoom is measured in logical pixels, so the zoom
 * that realises `k` is `k / pixelRatio` ({@link zoomForPixelScale}).
 *
 * The same `k` is the scale for in-game text: a glyph drawn at `k`
 * device pixels per UI pixel is as crisp as a tile ({@link uiScale}).
 *
 * The editor's free zoom does not go through this module.
 */

import type { Extent } from './play-camera.ts'

/** What {@link pixelScale} needs to know. */
export interface PixelScaleRequest {
  /** Drawing surface in DEVICE pixels. */
  readonly viewport: Extent
  /** The area of the game the view wants to show, in game pixels. */
  readonly content: Extent
  /** Largest `k` allowed. Defaults to no limit. */
  readonly max?: number
}

/** Border left around the picture, in whole device pixels. */
export interface Letterbox {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/**
 * The viewport in device pixels. Rounds like the GL drawing buffer does
 * (`round(allocation × scale)`), so the two never disagree by one pixel.
 */
export function deviceViewport(logical: Extent, pixelRatio: number): Extent {
  const ratio = pixelRatio > 0 && Number.isFinite(pixelRatio) ? pixelRatio : 1
  return { width: Math.round(logical.width * ratio), height: Math.round(logical.height * ratio) }
}

/**
 * The largest whole `k` at which `content` still fits the viewport, never
 * below 1: a viewport smaller than one game screen shows a cropped
 * picture at 1:1 rather than collapsing to nothing. An unusable viewport
 * or content falls back to 1 too.
 */
export function pixelScale(request: PixelScaleRequest): number {
  const { viewport, content } = request
  const cap = request.max !== undefined && request.max >= 1 ? Math.floor(request.max) : Number.POSITIVE_INFINITY
  if (!(viewport.width > 0) || !(viewport.height > 0) || !(content.width > 0) || !(content.height > 0)) return 1
  const fit = Math.floor(Math.min(viewport.width / content.width, viewport.height / content.height))
  return Math.min(cap, Math.max(1, fit))
}

/**
 * The camera zoom (logical pixels) at which one game pixel covers
 * `scale × scale` device pixels.
 */
export function zoomForPixelScale(scale: number, pixelRatio: number): number {
  const ratio = pixelRatio > 0 && Number.isFinite(pixelRatio) ? pixelRatio : 1
  return scale / ratio
}

/** The whole `k` a camera zoom amounts to, or `null` when it is fractional. */
export function pixelScaleOfZoom(zoom: number, pixelRatio: number): number | null {
  const k = zoom * (pixelRatio > 0 && Number.isFinite(pixelRatio) ? pixelRatio : 1)
  const whole = Math.round(k)
  return whole >= 1 && Math.abs(k - whole) < 1e-6 ? whole : null
}

/**
 * Scale for in-game text and other UI drawn on top of the picture. One
 * rule with {@link pixelScale}: `design` is the size the UI was laid out
 * for, in UI pixels.
 */
export function uiScale(viewport: Extent, design: Extent): number {
  return pixelScale({ viewport, content: design })
}

/**
 * The border around a picture of `shown` device pixels, centred on whole
 * device pixels. An odd leftover puts the extra pixel on the right/bottom;
 * an axis the picture overflows has no border.
 */
export function letterbox(viewport: Extent, shown: Extent): Letterbox {
  const leftover = (total: number, used: number): number => Math.max(0, Math.floor(total - used))
  const horizontal = leftover(viewport.width, shown.width)
  const vertical = leftover(viewport.height, shown.height)
  const left = Math.floor(horizontal / 2)
  const top = Math.floor(vertical / 2)
  return { left, top, right: horizontal - left, bottom: vertical - top }
}
