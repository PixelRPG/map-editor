import Gdk from '@girs/gdk-4.0'
import GLib from '@girs/glib-2.0'
import Gtk from '@girs/gtk-4.0'

/** One tip: a sentence and the widget it points at. */
export interface CoachStep {
  /** Stable key the {@link CoachStore} remembers the step by. */
  id: string
  text: string
  /** The widget to point at, resolved when the step is shown (`null` skips the step). */
  target: () => Gtk.Widget | null
  position: () => Gtk.PositionType
  /** Point at the centre of the target instead of its edge. */
  centre?: boolean
}

/** What has been shown already — owned by the app (GSettings), not by the widget. */
export interface CoachStore {
  isSeen(id: string): boolean
  markSeen(id: string): void
}

/**
 * First-run tips as non-modal popovers: `autohide` off and a capture-phase
 * click gesture on `root` that never claims the sequence, so a mark can
 * never swallow a stroke. One mark at a time; a
 * press anywhere under `root` dismisses it and brings up the next unseen
 * one. A step counts as seen the moment it is shown, so leaving the map
 * (which stops the marks) does not bring it back.
 */
export class CoachMarks {
  private readonly _steps: readonly CoachStep[]
  private readonly _store: CoachStore
  private _queue: CoachStep[] = []
  private _popover: Gtk.Popover | null = null
  private _currentId: string | null = null

  constructor(root: Gtk.Widget, steps: readonly CoachStep[], store: CoachStore) {
    this._steps = steps
    this._store = store
    const press = new Gtk.GestureClick({ button: 0, propagationPhase: Gtk.PropagationPhase.CAPTURE })
    press.connect('pressed', () => this.dismiss())
    root.add_controller(press)
    root.connect('unmap', () => this.stop())
  }

  /** Id of the mark on screen right now, `null` while none is visible. */
  get visibleId(): string | null {
    return this._popover?.get_mapped() ? this._currentId : null
  }

  /** Queue every step not yet seen and show the first. */
  start(): void {
    this.stop()
    this._queue = this._steps.filter((step) => !this._store.isSeen(step.id))
    this._showNext()
  }

  /** Dismiss the mark on screen, if any, and show the next one. */
  dismiss(): void {
    if (!this._popover) return
    this._close()
    this._showNext()
  }

  /** Drop the mark on screen and everything still queued. */
  stop(): void {
    this._queue = []
    this._close()
  }

  private _close(): void {
    const popover = this._popover
    this._popover = null
    this._currentId = null
    if (!popover) return
    popover.connect('closed', () => popover.unparent())
    popover.popdown()
  }

  private _showNext(): void {
    while (this._queue.length > 0) {
      const step = this._queue.shift() as CoachStep
      const target = step.target()
      if (!target?.get_mapped()) continue
      this._store.markSeen(step.id)
      this._popover = this._build(step, target)
      this._currentId = step.id
      // Allocation settles after the map handler; popping up on idle
      // lets the arrow find its target on the first frame.
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        this._popover?.popup()
        return GLib.SOURCE_REMOVE
      })
      return
    }
  }

  private _build(step: CoachStep, target: Gtk.Widget): Gtk.Popover {
    const label = new Gtk.Label({
      label: step.text,
      wrap: true,
      maxWidthChars: 22,
      justify: Gtk.Justification.CENTER,
      marginTop: 6,
      marginBottom: 6,
      marginStart: 6,
      marginEnd: 6,
    })
    label.add_css_class('heading')
    const popover = new Gtk.Popover({
      autohide: false,
      focusable: false,
      hasArrow: true,
      position: step.position(),
      child: label,
    })
    popover.add_css_class('coach-mark')
    // A popover is its own surface: a press on the bubble never reaches the
    // root gesture, so the bubble dismisses itself.
    const tap = new Gtk.GestureClick({ button: 0 })
    tap.connect('pressed', () => this.dismiss())
    popover.add_controller(tap)
    popover.set_parent(target)
    if (step.centre) {
      const rect = new Gdk.Rectangle()
      rect.x = Math.round(target.get_width() / 2)
      rect.y = Math.round(target.get_height() / 2)
      rect.width = 1
      rect.height = 1
      popover.set_pointing_to(rect)
    }
    return popover
  }
}
