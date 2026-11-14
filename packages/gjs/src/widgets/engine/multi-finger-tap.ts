import Gdk from '@girs/gdk-4.0'
import Gtk from '@girs/gtk-4.0'

import { EMPTY_TAP_STATE, moveTapContact, pressTapContact, releaseTapContact, type TapState } from './touch-gesture.ts'

/** Called once per recognised tap, with how many fingers made it. */
export type MultiFingerTapHandler = (fingers: number) => void

/**
 * Two- and three-finger taps on the canvas.
 *
 * GTK has no multi-finger tap gesture: `Gtk.GestureClick` is a
 * `GtkGestureSingle` and gives up on the second contact, and
 * `Gtk.GestureZoom` only reports scale. So the raw touch stream is read
 * here and fed to the reducer in `touch-gesture.ts`, which decides what
 * it was. This file stays the adapter — no thresholds, no counting.
 *
 * It listens in the CAPTURE phase and always propagates. A two-finger
 * tap is also the start of a pinch as far as `attachPinchZoom` is
 * concerned, and that gesture CLAIMS its sequences; capturing runs
 * before any of that and returning `EVENT_PROPAGATE` leaves every other
 * controller — the pinch, the engine's own pointer bridge — seeing
 * exactly what it saw before. The recogniser can only ever add a
 * gesture, never swallow one.
 *
 * Positions come from `Gdk.Event` in SURFACE coordinates rather than
 * widget-local ones. Both the slop and the nearest-contact matching are
 * relative measures, so the offset cancels out.
 */
export function attachMultiFingerTap(widget: Gtk.Widget, onTap: MultiFingerTapHandler): Gtk.EventControllerLegacy {
  const controller = new Gtk.EventControllerLegacy()
  controller.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)

  let state: TapState = EMPTY_TAP_STATE

  controller.connect('event', (_controller, event: Gdk.Event) => {
    const type = event.get_event_type()
    if (type === Gdk.EventType.TOUCH_CANCEL) {
      state = EMPTY_TAP_STATE
      return Gdk.EVENT_PROPAGATE
    }

    const [located, x, y] = event.get_position()
    if (!located) return Gdk.EVENT_PROPAGATE
    const time = event.get_time()

    if (type === Gdk.EventType.TOUCH_BEGIN) {
      state = pressTapContact(state, x, y, time)
    } else if (type === Gdk.EventType.TOUCH_UPDATE) {
      state = moveTapContact(state, x, y)
    } else if (type === Gdk.EventType.TOUCH_END) {
      const lift = releaseTapContact(state, x, y, time)
      state = lift.state
      // One finger lifting is an ordinary tap and belongs to the tools.
      if (lift.fingers >= 2) onTap(lift.fingers)
    }

    return Gdk.EVENT_PROPAGATE
  })

  widget.add_controller(controller)
  return controller
}
