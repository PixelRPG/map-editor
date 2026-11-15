import type { Camera, CameraStrategy, Engine, Vector } from 'excalibur'
import { vec } from 'excalibur'

import { clampCameraFocus, type Extent } from '../utils/play-camera.ts'

/**
 * Hold the run camera inside the map, centring a map smaller than the
 * view.
 *
 * Replaces excalibur's `LimitCameraBoundsStrategy`, which clamps each
 * axis against `drawWidth / 2` with no case for a map narrower than the
 * view: there both of its branches resolve to `left + halfDrawWidth`,
 * so a small interior room is pushed against the top-left of the window
 * instead of sitting in the middle of it. The arithmetic itself —
 * including that third case — is unit-tested in `utils/play-camera.ts`;
 * this class only reads the live engine.
 *
 * Add it AFTER `lockToActor`: strategies run in insertion order and each
 * one receives the focus the previous one produced, so the follow has to
 * propose a focus before this one is allowed to veto it.
 */
export class MapBoundsCameraStrategy implements CameraStrategy<Extent> {
  constructor(public target: Extent) {}

  action = (target: Extent, camera: Camera, engine: Engine): Vector => {
    const focus = camera.getFocus()
    // `drawWidth`/`drawHeight` are already divided by the camera zoom,
    // so they are world units and need no further conversion.
    const view: Extent = { width: engine.drawWidth, height: engine.drawHeight }
    const clamped = clampCameraFocus({ x: focus.x, y: focus.y }, target, view)
    return vec(clamped.x, clamped.y)
  }
}
