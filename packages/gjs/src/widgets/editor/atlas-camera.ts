// Pure atlas-camera math: how a world rectangle in atlas space becomes a
// card rectangle on the scrollable surface at a given zoom, which zoom
// fits the world into a viewport, and where the scroll offsets go when
// zooming or centring. GTK-free so it can be unit-tested — the canvas
// only applies the numbers this module returns.
//
// Two spaces are in play:
// - **atlas space** — the persisted world coordinates. One atlas px is
//   8 game px, so a 16 px-tile map draws 2 atlas px per tile.
// - **surface space** — widget pixels inside the `Gtk.Fixed`. Zoom `z`
//   is widget px per atlas px, which is also what the OSD shows as
//   `z * 100 %`.

import { rectExtent, type SceneRect } from './atlas-canvas.geometry.ts'

/** Smallest atlas zoom the camera allows (10 %). */
export const ATLAS_ZOOM_MIN = 0.1

/** Largest atlas zoom the camera allows (400 %). */
export const ATLAS_ZOOM_MAX = 4

/**
 * Shortest side (surface px) a scene card is ever drawn at. A single
 * 11x11 room is 22 atlas px wide, which would vanish at a zoom that fits
 * a 176x148 overworld next to it — so small maps stop shrinking here and
 * stay clickable instead.
 */
export const CARD_MIN_SHORT_SIDE = 64

/** The same floor on phone widths, where touch targets need more room. */
export const CARD_MIN_SHORT_SIDE_PHONE = 72

/** A point in surface space — the origin cards are laid out from. */
export interface SurfaceOrigin {
  x: number
  y: number
}

const ORIGIN_ZERO: SurfaceOrigin = { x: 0, y: 0 }

/** Keep an atlas zoom inside `[ATLAS_ZOOM_MIN, ATLAS_ZOOM_MAX]`. */
export function clampAtlasZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ATLAS_ZOOM_MIN
  return Math.min(ATLAS_ZOOM_MAX, Math.max(ATLAS_ZOOM_MIN, zoom))
}

/**
 * Surface size of a card whose map measures `world` atlas px, drawn at
 * `zoom`. Scaled uniformly up when that would put the short side below
 * `minShortSide`, so the card keeps the map's aspect ratio instead of
 * being letterboxed into a minimum box.
 */
export function cardPixelSize(
  world: { w: number; h: number },
  zoom: number,
  minShortSide: number,
): { w: number; h: number } {
  const w = world.w * zoom
  const h = world.h * zoom
  // A degenerate map (no columns or no rows) has no aspect ratio to
  // preserve, so there is nothing to scale up — report it as empty and
  // let the caller skip it.
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 }
  const short = Math.min(w, h)
  const factor = short < minShortSide ? minShortSide / short : 1
  return { w: Math.round(w * factor), h: Math.round(h * factor) }
}

/**
 * Whether `minShortSide` enlarged this card past its true scale — the
 * card is drawn bigger than the world says, so it can grow into a
 * neighbour the world keeps clear. The atlas uses it to decide which
 * cards a layout pass may push aside (`separateCardRects`).
 *
 * A degenerate map is never floored: {@link cardPixelSize} reports it as
 * empty and the caller skips it.
 */
export function isCardFloored(world: { w: number; h: number }, zoom: number, minShortSide: number): boolean {
  const w = world.w * zoom
  const h = world.h * zoom
  if (!(w > 0) || !(h > 0)) return false
  return Math.min(w, h) < minShortSide
}

/**
 * Every card's BODY rect in surface coords: the world rect scaled by
 * `zoom`, floored to `minShortSide`, offset by `origin` (the dynamic
 * surface padding). Cards are anchored at their top-left corner, so a
 * card floored to the minimum size grows right and down — never off the
 * surface origin. Scene order is preserved; the overview minimap and the
 * teleport overlay both index into the result.
 */
export function drawnRects(
  worldRects: readonly SceneRect[],
  zoom: number,
  minShortSide: number,
  origin: SurfaceOrigin = ORIGIN_ZERO,
): SceneRect[] {
  return worldRects.map((rect) => ({
    x: origin.x + Math.round(rect.x * zoom),
    y: origin.y + Math.round(rect.y * zoom),
    ...cardPixelSize(rect, zoom, minShortSide),
  }))
}

/**
 * Size of the drawn world at `zoom`, minimum card size included. Larger
 * than `extent * zoom` whenever a small map hit the floor, which is why
 * {@link fitZoom} cannot trust the naive estimate alone.
 */
export function drawnExtent(
  worldRects: readonly SceneRect[],
  zoom: number,
  minShortSide: number,
): { width: number; height: number } {
  return rectExtent(drawnRects(worldRects, zoom, minShortSide))
}

/**
 * Whether every drawn card already sits inside a viewport of this size —
 * the test behind "the minimap joins the OSD only while the world is
 * larger than the window" (REDESIGN.md § 4.2).
 *
 * It measures the cards' own bounding box, NOT the surface: the surface
 * carries {@link surfacePadding} on every side and is therefore always
 * bigger than the viewport, so comparing against it would answer "does
 * not fit" for every world that ever existed.
 *
 * An empty world fits by definition.
 */
export function worldFitsViewport(drawn: readonly SceneRect[], viewport: { w: number; h: number }): boolean {
  const drawnCards = drawn.filter((rect) => rect.w > 0 && rect.h > 0)
  if (drawnCards.length === 0) return true
  const left = Math.min(...drawnCards.map((rect) => rect.x))
  const top = Math.min(...drawnCards.map((rect) => rect.y))
  const right = Math.max(...drawnCards.map((rect) => rect.x + rect.w))
  const bottom = Math.max(...drawnCards.map((rect) => rect.y + rect.h))
  return right - left <= viewport.w && bottom - top <= viewport.h
}

/**
 * How many times {@link fitZoom} re-measures the drawn world. The naive
 * estimate is wrong only because of floored cards, and each pass shrinks
 * the gap by the amount the floor contributes — a handful of passes is
 * already generous for a world of a dozen maps.
 */
const FIT_REFINE_PASSES = 8

/**
 * Largest zoom at which the whole world fits a `view`-sized viewport
 * with `margin` px to spare on every side.
 *
 * The naive `min(available / extent)` ignores the minimum card size, so
 * a world of one big map next to a floored small room draws wider than
 * the estimate predicts. Each refinement pass re-measures the REAL drawn
 * extent and shrinks; since a floored card's size is constant in surface
 * px while its position shrinks with the zoom, the sequence converges on
 * a zoom that fits. The passes only ever shrink, so the result is never
 * larger than the naive estimate.
 */
export function fitZoom(
  view: { w: number; h: number },
  worldRects: readonly SceneRect[],
  margin: number,
  minShortSide: number,
): number {
  const extent = rectExtent(worldRects)
  if (!(extent.width > 0) || !(extent.height > 0)) return clampAtlasZoom(1)
  // A viewport smaller than its own margins would invert the fit — one
  // available pixel is the floor.
  const availW = Math.max(1, view.w - margin * 2)
  const availH = Math.max(1, view.h - margin * 2)
  let zoom = clampAtlasZoom(Math.min(availW / extent.width, availH / extent.height))
  for (let pass = 0; pass < FIT_REFINE_PASSES; pass += 1) {
    const drawn = drawnExtent(worldRects, zoom, minShortSide)
    if (drawn.width <= availW && drawn.height <= availH) break
    const next = clampAtlasZoom(zoom * Math.min(1, availW / drawn.width, availH / drawn.height))
    // Clamped at the minimum zoom, or already exact: nothing left to
    // give, and the caller can pan.
    if (next === zoom) break
    zoom = next
  }
  return zoom
}

/**
 * New scroll offset on one axis so the surface point under `pointer`
 * (viewport-relative) stays under it across a zoom change. Never
 * negative — the adjustment clamps the far end itself.
 */
export function zoomAroundPointer(scroll: number, pointer: number, zoomOld: number, zoomNew: number): number {
  if (!(zoomOld > 0)) return scroll
  return Math.max(0, (scroll + pointer) * (zoomNew / zoomOld) - pointer)
}

/**
 * Padding to put around the drawn world on one axis. A world smaller
 * than the viewport gets exactly enough padding to sit centred, which
 * leaves the adjustment with zero scroll range — so "fit" really does
 * stop the view from drifting. A larger world keeps `minPadding` of
 * breathing room for dragging cards outwards.
 */
export function surfacePadding(drawn: number, viewport: number, minPadding: number): number {
  return Math.max(minPadding, Math.round((viewport - drawn) / 2))
}

/**
 * Scroll offset that centres the surface span `[offset, offset + size]`
 * in a `pageSize`-wide viewport, clamped to the adjustment's own
 * `[0, upper - pageSize]` range.
 */
export function centeredScroll(offset: number, size: number, upper: number, pageSize: number): number {
  return Math.max(0, Math.min(upper - pageSize, offset + size / 2 - pageSize / 2))
}
