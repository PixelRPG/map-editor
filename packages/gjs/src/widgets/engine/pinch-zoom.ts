import Gtk from '@girs/gtk-4.0'
import { EDITOR_CONSTANTS, snapZoomToWholePixel, type ZoomRange } from '@pixelrpg/engine'

import { beginTwoFinger, stepTwoFinger, twoFingerDidMove, type TwoFingerState } from './touch-gesture.ts'

/** What the gesture needs from the engine widget that owns it. */
export interface PinchZoomHost {
  /** Current camera zoom, or null before the engine is running. */
  getCameraZoom(): number | null
  /** Set the zoom while holding the world point under a screen position still. */
  zoomAboutPoint(zoom: number, screenX: number, screenY: number): void
  /** Move the camera by a screen-pixel offset, the way a drag pans it. */
  panCameraBy(screenDeltaX: number, screenDeltaY: number): void
}

const ZOOM_RANGE: ZoomRange = { min: EDITOR_CONSTANTS.MIN_ZOOM, max: EDITOR_CONSTANTS.MAX_ZOOM }

/**
 * The two-finger canvas gesture: pinch to zoom, drag to pan, and a
 * spring to the nearest whole-pixel zoom when the fingers leave.
 *
 * Zoom otherwise rides the scroll wheel, the `+` / `-` / `<Primary>0`
 * accelerators and the "⋯" menu — none of which a phone has, so the menu
 * was a touch user's only way to change zoom.
 *
 * `Gtk.GestureZoom` is a two-finger gesture, so it does not compete with
 * the one-finger drag the camera pans on: a `GtkGestureSingle` bails out
 * the moment a second contact arrives, and this gesture only begins once
 * one has. That split is the usual touch contract — one finger moves the
 * map, two fingers scale AND move it.
 *
 * Both halves are driven from `Gtk.Gesture::update` rather than
 * `scale-changed`: two fingers that travel without spreading never
 * change the scale, so a pan hung off `scale-changed` would simply not
 * fire. `update` runs on every processed event, and
 * `get_scale_delta()` carries the same number `scale-changed` would
 * have passed.
 *
 * The decisions themselves — how a cumulative scale becomes a zoom, how
 * far the midpoint moved, where the spring lands — are in
 * `touch-gesture.ts` and unit-tested there. Touch cannot be injected
 * into the headless harness, so that is where the proof has to live.
 */
export function attachPinchZoom(widget: Gtk.Widget, host: PinchZoomHost): Gtk.GestureZoom {
  const gesture = new Gtk.GestureZoom()
  let state: TwoFingerState | null = null
  let travel = 0

  const centreOf = (): [number, number] => {
    // Anchor on the point between the fingers, not the viewport centre:
    // on a phone the thing being zoomed is whatever is under the pinch,
    // and centre-anchored scaling slides it out from under them. Falls
    // back to the centre when GTK cannot report a bounding box.
    const [hasCentre, centreX, centreY] = gesture.get_bounding_box_center()
    if (hasCentre) return [centreX, centreY]
    return [widget.get_allocated_width() / 2, widget.get_allocated_height() / 2]
  }

  gesture.connect('begin', () => {
    const [centreX, centreY] = centreOf()
    state = beginTwoFinger(host.getCameraZoom() ?? 1, centreX, centreY)
    travel = 0
    // Claim the contacts, or the camera gets driven twice per frame. The
    // touch stream also reaches `PointerGestureSystem`, whose drag feeds
    // `CameraControlSystem`'s pan — so a pinch panned AND scaled at once,
    // and the map visibly jumped between the two results.
    //
    // Claiming is the GTK-native way to settle that: GTK cancels the
    // sequence for every other controller, the event bridge turns that
    // into `pointercancel`, and `PointerGestureSystem` ends the drag
    // (`pointer.on('cancel')` → `POINTER_DRAG_END`) instead of feeding
    // more deltas. No flag has to be threaded from this widget into the
    // engine package to say "a pinch is in progress". It is also what
    // makes the second finger CANCEL a one-finger gesture rather than
    // let it commit (REDESIGN § 5.5).
    gesture.set_state(Gtk.EventSequenceState.CLAIMED)
  })

  gesture.connect('update', () => {
    if (!state) return
    const [centreX, centreY] = centreOf()
    const step = stepTwoFinger(state, gesture.get_scale_delta(), centreX, centreY, ZOOM_RANGE)
    state = step.state
    host.zoomAboutPoint(step.zoom, step.anchorX, step.anchorY)
    if (step.panX !== 0 || step.panY !== 0) {
      travel += Math.hypot(step.panX, step.panY)
      host.panCameraBy(step.panX, step.panY)
    }
  })

  // Spring to a whole-pixel scale once the fingers are gone. A pinch
  // lands on an arbitrary fraction, and 16 px tiles resampled onto a
  // fractional grid shimmer and grow and lose their one-pixel seams.
  // Snapping on release keeps the gesture continuous while it is live
  // and the artwork honest the rest of the time.
  // Two fingers that rested still and left again were a two-finger TAP
  // — undo, handled by `multi-finger-tap.ts`. This gesture begins for
  // that too, and springing on its end would yank a deliberate 1.2x
  // zoom to 1x every time the user undid something.
  const settle = () => {
    const began = state
    const travelled = travel
    state = null
    travel = 0
    const zoom = host.getCameraZoom()
    if (zoom === null || began === null) return
    if (!twoFingerDidMove(travelled, began.zoomAtBegin, zoom)) return
    const snapped = snapZoomToWholePixel(zoom, ZOOM_RANGE)
    if (snapped === zoom) return
    const [centreX, centreY] = centreOf()
    host.zoomAboutPoint(snapped, centreX, centreY)
  }

  gesture.connect('end', settle)
  gesture.connect('cancel', settle)

  widget.add_controller(gesture)
  return gesture
}
