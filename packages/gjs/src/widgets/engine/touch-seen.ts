import Gdk from '@girs/gdk-4.0'
import Gtk from '@girs/gtk-4.0'

/** Called the first time a finger touches the canvas. */
export type TouchSeenHandler = () => void

/**
 * Report the first touch the canvas ever receives.
 *
 * REDESIGN § 5.6 gates the on-screen controls on "the last pointer event
 * came from a touchscreen", and this is the cheap half of that test: a
 * session that has touched the canvas once has a touchscreen, whatever
 * the window width. The engine widget latches the answer, so a player
 * who switches back to the trackpad keeps the controls rather than
 * having them vanish mid-run — a control that disappears while a run is
 * live is worse than one shown to someone who does not need it.
 *
 * `Gdk.EventType.TOUCH_BEGIN` rather than a device-source check on a
 * `Gtk.Gesture`: the event type IS the device's answer, and it arrives
 * for the very first contact instead of only once some gesture decides
 * to recognise something.
 *
 * CAPTURE phase and always `EVENT_PROPAGATE`, for the same reason
 * `multi-finger-tap.ts` spells out at length — the pinch and the stick
 * claim their sequences, and an observer must never be able to change
 * what they see.
 */
export function watchTouchSeen(widget: Gtk.Widget, onSeen: TouchSeenHandler): Gtk.EventControllerLegacy {
  const controller = new Gtk.EventControllerLegacy()
  controller.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)

  let seen = false
  controller.connect('event', (_controller, event: Gdk.Event) => {
    if (!seen && event.get_event_type() === Gdk.EventType.TOUCH_BEGIN) {
      seen = true
      onSeen()
    }
    return Gdk.EVENT_PROPAGATE
  })

  widget.add_controller(controller)
  return controller
}
