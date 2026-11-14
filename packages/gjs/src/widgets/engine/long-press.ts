import Gtk from '@girs/gtk-4.0'

/** Called once per recognised hold, with the press position in widget-local pixels. */
export type LongPressHandler = (x: number, y: number) => void

/**
 * Press-and-hold on the canvas — the touch stand-in for a right-click.
 *
 * Unlike the multi-finger taps this needs no reducer of our own:
 * `Gtk.GestureLongPress` is exactly the right recogniser, and its delay
 * is the platform's (`gtk-long-press-time`), so the hold feels like
 * every other hold on the device. REDESIGN §5.5 quotes 500 ms as the
 * nominal figure; forcing it here via `delay-factor` would override the
 * user's own setting for no gain.
 *
 * `touch-only` keeps it off the mouse: a pointer already has a real
 * secondary button, and a mouse user resting a pressed button would
 * otherwise get a context menu they never asked for.
 *
 * The gesture cancels itself as soon as the finger travels, so a hold
 * can never swallow the start of a pan or a stroke; and because it only
 * ever fires at the end of a stationary press, the single-contact
 * pointer stream from `@gjsify/event-bridge` keeps flowing untouched —
 * the tap at the same spot still reaches the tools.
 */
export function attachLongPress(widget: Gtk.Widget, onLongPress: LongPressHandler): Gtk.GestureLongPress {
  const gesture = new Gtk.GestureLongPress({ touchOnly: true })
  gesture.connect('pressed', (_gesture, x: number, y: number) => {
    onLongPress(x, y)
  })
  widget.add_controller(gesture)
  return gesture
}
