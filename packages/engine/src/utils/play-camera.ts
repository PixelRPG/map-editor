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
