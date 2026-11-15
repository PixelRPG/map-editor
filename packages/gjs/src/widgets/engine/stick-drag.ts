import Gtk from '@girs/gtk-4.0'

import { clampStickOrigin, isInStickRegion, type StickDrag, stickKnobOffset, type StickPoint } from './virtual-stick.ts'

/** What the stick gesture needs from the engine widget that owns it. */
export interface VirtualStickHost {
  /**
   * Whether a press in the stick's region should summon it at all.
   *
   * False while editing: this gesture claims its sequence the moment it
   * begins, and a gesture that claimed every press in the lower-left
   * corner of the canvas would swallow painting, selection and the
   * long-press menu there. The stick exists only during a run.
   */
  isStickEnabled(): boolean
  /** The canvas size in widget coordinates, for region + clamping. */
  stickCanvasSize(): { width: number; height: number }
  /** The stick appeared, moved, or (with `null`) was released. */
  onStickChanged(drag: StickDrag | null): void
}

/**
 * The virtual joystick's GTK half: a touch-only drag on the canvas that
 * summons a stick wherever the thumb lands in the lower-left region.
 *
 * Touch-only is the point. The same drag on a mouse is the camera pan,
 * and a mouse user on a phone-width window has a keyboard; stealing
 * left-button drags would break editing for everyone to serve a device
 * that is not present.
 *
 * The sequence is CLAIMED on begin, for the reason spelled out at
 * length in `pinch-zoom.ts`: the touch stream also reaches
 * `PointerGestureSystem`, whose drag feeds `CameraControlSystem`'s pan,
 * so an unclaimed stick drag would pan the map under the hero while
 * steering them. Claiming makes GTK cancel the sequence for every other
 * controller, which the event bridge turns into `pointercancel` and the
 * engine into a drag end — no flag has to be threaded into the engine
 * to say "a thumb is on the stick".
 *
 * Claiming is also why {@link VirtualStickHost.isStickEnabled} is
 * consulted first rather than the gesture simply being attached: a
 * claim is unconditional once made, so the decision has to happen
 * before it.
 *
 * All the geometry — where the region is, where the base may sit, how
 * far the knob travels — is in `virtual-stick.ts` and unit-tested
 * there. Touch cannot be injected into the headless harness, so that is
 * where the proof has to live.
 */
export function attachVirtualStick(widget: Gtk.Widget, host: VirtualStickHost): Gtk.GestureDrag {
  const gesture = new Gtk.GestureDrag()
  gesture.set_touch_only(true)
  let origin: StickPoint | null = null

  gesture.connect('drag-begin', (_gesture, startX: number, startY: number) => {
    origin = null
    if (!host.isStickEnabled()) {
      gesture.set_state(Gtk.EventSequenceState.DENIED)
      return
    }
    const { width, height } = host.stickCanvasSize()
    if (!isInStickRegion(startX, startY, width, height)) {
      // Deny rather than stay neutral: the rest of the canvas keeps its
      // pan and pinch during a run, and a gesture left in the "maybe"
      // state would delay them until it timed out.
      gesture.set_state(Gtk.EventSequenceState.DENIED)
      return
    }
    gesture.set_state(Gtk.EventSequenceState.CLAIMED)
    origin = clampStickOrigin({ x: startX, y: startY }, width, height)
    // The base is clamped away from the edge, so the thumb may already
    // sit off-centre on the very first frame — report the real offset
    // instead of a centred knob that jumps on the next move.
    host.onStickChanged({ origin, knob: stickKnobOffset(origin, { x: startX, y: startY }) })
  })

  gesture.connect('drag-update', (_gesture, offsetX: number, offsetY: number) => {
    if (!origin) return
    const [hasStart, startX, startY] = gesture.get_start_point()
    if (!hasStart) return
    const knob = stickKnobOffset(origin, { x: startX + offsetX, y: startY + offsetY })
    host.onStickChanged({ origin, knob })
  })

  // The hero must stop the instant the thumb leaves, so the intent is
  // dropped here. The stick's fade-out is the host's business — see
  // `STICK_HIDE_DELAY_MS`.
  const release = () => {
    if (!origin) return
    origin = null
    host.onStickChanged(null)
  }

  gesture.connect('drag-end', release)
  gesture.connect('cancel', release)

  widget.add_controller(gesture)
  return gesture
}
