import Gtk from '@girs/gtk-4.0'
import { EDITOR_CONSTANTS } from '@pixelrpg/engine'

/** What the gesture needs from the engine widget that owns it. */
export interface PinchZoomHost {
  /** Current camera zoom, or null before the engine is running. */
  getCameraZoom(): number | null
  /** Set the zoom while holding the world point under a screen position still. */
  zoomAboutPoint(zoom: number, screenX: number, screenY: number): void
}

/**
 * Pinch-to-zoom for the engine canvas.
 *
 * Zoom otherwise rides the scroll wheel, the `+` / `-` / `<Primary>0`
 * accelerators and the "⋯" menu — none of which a phone has, so the menu
 * was a touch user's only way to change zoom.
 *
 * `Gtk.GestureZoom` is a two-finger gesture, so it does not compete with
 * the one-finger drag the camera pans on: a `GtkGestureSingle` bails out
 * the moment a second contact arrives, and this gesture only begins once
 * one has. That split is the usual touch contract — one finger moves the
 * map, two fingers scale it.
 *
 * Scale is applied against the zoom the gesture STARTED from rather than
 * the live value. `scale-changed` reports cumulative scale since `begin`
 * (1.0 = fingers where they started), so multiplying the current zoom by
 * it each time would compound: a steady 1.5 would ratchet 1.5, 2.25,
 * 3.375 … per callback instead of settling at 1.5.
 */
export function attachPinchZoom(widget: Gtk.Widget, host: PinchZoomHost): Gtk.GestureZoom {
  const gesture = new Gtk.GestureZoom()
  let zoomAtBegin = 1

  gesture.connect('begin', () => {
    zoomAtBegin = host.getCameraZoom() ?? 1
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
    // engine package to say "a pinch is in progress".
    gesture.set_state(Gtk.EventSequenceState.CLAIMED)
  })

  gesture.connect('scale-changed', (_gesture: Gtk.GestureZoom, scale: number) => {
    if (!Number.isFinite(scale) || scale <= 0) return

    const target = clamp(zoomAtBegin * scale, EDITOR_CONSTANTS.MIN_ZOOM, EDITOR_CONSTANTS.MAX_ZOOM)

    // Anchor on the point between the fingers, not the viewport centre:
    // on a phone the thing being zoomed is whatever is under the pinch,
    // and centre-anchored scaling slides it out from under them. Falls
    // back to the centre when GTK cannot report a bounding box.
    const [hasCentre, centreX, centreY] = gesture.get_bounding_box_center()
    if (!hasCentre) {
      host.zoomAboutPoint(target, widget.get_allocated_width() / 2, widget.get_allocated_height() / 2)
      return
    }
    host.zoomAboutPoint(target, centreX, centreY)
  })

  widget.add_controller(gesture)
  return gesture
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
