/**
 * Pure camera arithmetic for a run.
 *
 * A run has to frame the map without the editor's chrome helping: the
 * player is followed, but the view must never show the void outside the
 * map, and a map smaller than the view has to sit in the MIDDLE of it
 * rather than against one edge. Excalibur's own
 * `LimitCameraBoundsStrategy` gets the first half right and has no case
 * for the second — both its branches push the focus to
 * `left + halfDrawWidth`, which on a map narrower than the view parks
 * the room off to one side.
 *
 * The maths lives here, free of `excalibur` and `gi://`, because the
 * camera is one of the few things the headless capture harness cannot
 * assert about: see `runtime/map-bounds-camera.strategy.ts` for the thin
 * adapter that feeds it the live engine's numbers.
 *
 * See `docs/design/ui-redesign/REDESIGN.md` § 4.6 for the behaviour
 * these implement.
 */

import { deviceViewport, pixelScale, zoomForPixelScale } from './pixel-scale.ts'
import { clampZoom, type ZoomRange } from './zoom.ts'

/** A world-space extent in pixels — the size of the map or of the view. */
export interface Extent {
  readonly width: number
  readonly height: number
}

/** A world-space point. Deliberately not excalibur's `Vector`. */
export interface Focus {
  readonly x: number
  readonly y: number
}

/**
 * The smallest window on the world a fresh run should open with.
 *
 * Stated in tiles rather than as a zoom factor so the promise survives
 * a change of tile size: a 16 px-tile map and a 32 px-tile map both
 * open showing a room someone can play in, not four tiles of floor.
 */
export const PLAY_MIN_TILES = {
  columns: 15,
  rows: 10,
} as const

/** What {@link playZoom} needs to know about the window and the map. */
export interface PlayZoomRequest {
  /** Size of the drawing surface in logical pixels, before zoom. */
  readonly resolution: Extent
  /** Device pixels per logical pixel (fractional at 125 % / 150 %). Defaults to 1. */
  readonly pixelRatio?: number
  /** Size of the whole map in world pixels. */
  readonly map: Extent
  /** Size of one tile in world pixels. */
  readonly tile: Extent
  /** Bounds the answer is held inside. */
  readonly bounds: ZoomRange
}

/**
 * Keep a camera focus inside the map on one axis.
 *
 * Three cases, and the middle one is the whole reason this file exists:
 *
 * - no usable numbers → leave the focus alone (a map that has not
 *   loaded yet must not yank the camera to the origin)
 * - the view is at least as big as the map → centre the map, so the
 *   empty margin is split evenly instead of all landing on one side
 * - otherwise → clamp so neither edge of the view leaves the map
 */
function clampAxis(focus: number, mapSize: number, viewSize: number): number {
  if (!(mapSize > 0) || !(viewSize > 0) || !Number.isFinite(focus)) return focus
  if (viewSize >= mapSize) return mapSize / 2
  const half = viewSize / 2
  return Math.min(Math.max(focus, half), mapSize - half)
}

/** Apply the per-axis rule of {@link clampAxis} to a camera focus. */
export function clampCameraFocus(focus: Focus, map: Extent, view: Extent): Focus {
  return {
    x: clampAxis(focus.x, map.width, view.width),
    y: clampAxis(focus.y, map.height, view.height),
  }
}

/**
 * The zoom at which the whole map just fits the view, with `margin` (a
 * fraction of the view, per side) left empty. `0` when either extent is
 * unusable. The single rule for "whole map in view": a run's floor and the
 * editor's first framing of a map both read it.
 */
export function wholeMapZoom(view: Extent, map: Extent, margin = 0): number {
  if (!(map.width > 0) || !(map.height > 0) || !(view.width > 0) || !(view.height > 0)) return 0
  const usable = 1 - 2 * Math.min(0.4, Math.max(0, margin))
  return Math.min((view.width * usable) / map.width, (view.height * usable) / map.height)
}

/**
 * The zoom a fresh run should open at.
 *
 * Two wishes pull against each other. Show at least
 * {@link PLAY_MIN_TILES}, so the run reads as a game rather than as a
 * tile inspector — more magnification means fewer tiles, so that is a
 * ceiling. And never zoom out past the whole map, because every pixel
 * beyond it is void — that is a floor, and it wins on a map smaller
 * than the tile budget.
 *
 * Both are answered by `pixelScale` in DEVICE pixels, so the result is a
 * whole number `k` of device pixels per game pixel at any display scale;
 * the zoom is `k / pixelRatio`. Rounding is always DOWN: a 360 px phone
 * allows 1.5, and at 2 the run would show eleven tiles instead of fifteen.
 *
 * The editor's own zoom is deliberately not consulted.
 */
export function playZoom(request: PlayZoomRequest): number {
  const { resolution, map, tile, bounds } = request
  const ratio = request.pixelRatio ?? 1
  if (!(resolution.width > 0) || !(resolution.height > 0) || !(tile.width > 0) || !(tile.height > 0)) {
    return clampZoom(1, bounds)
  }
  const viewport = deviceViewport(resolution, ratio)
  const budget = { width: PLAY_MIN_TILES.columns * tile.width, height: PLAY_MIN_TILES.rows * tile.height }
  const scale = Math.max(pixelScale({ viewport, content: budget }), pixelScale({ viewport, content: map }))
  const ceiling = Math.max(1, Math.floor(bounds.max * (ratio > 0 ? ratio : 1)))
  return clampZoom(zoomForPixelScale(Math.min(scale, ceiling), ratio), bounds)
}
