import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import {
  bottomInsetFor,
  clampSheetHeight,
  cycleDetent,
  detentHeight,
  dragVelocityY,
  nextDetent,
  releaseDetent,
  type SheetDetent,
  SHEET_DRAG_CLAIM_PX,
  type SheetDragSample,
  type SheetMetrics,
} from './sheet-detents.ts'

/** The widgets the detents are made of. All live in `scene-editor.blp`. */
export interface SheetDetentHosts {
  /** The sheet itself — opened, closed and made modal from here. */
  readonly sheet: Adw.BottomSheet
  /**
   * The sheet's child. Its `height-request` IS the sheet's height:
   * libadwaita measures this widget's natural height and allocates that
   * (`adw_bottom_sheet_size_allocate`), and `sheet-height` is read-only.
   */
  readonly view: Gtk.Widget
  /** The full-width strip that carries the drag and the tap. */
  readonly grabber: Gtk.Widget
  /** The page scroller — a scroll past its top collapses one detent. */
  readonly scroller: Gtk.ScrolledWindow
  /** The widget the detent heights are measured against. */
  readonly canvas: Gtk.Widget
}

/** Stiff enough to feel attached to the finger, with no overshoot past Full. */
const SHEET_SPRING = { dampingRatio: 1, mass: 1, stiffness: 500 } as const

/** How many `drag-update` readings {@link dragVelocityY} gets to look at. */
const SHEET_SAMPLE_WINDOW = 6

/**
 * The phone sheet's three detents, wired to GTK.
 *
 * Plain, not a `GObject` — it owns no widget of its own, only gestures
 * on widgets the template already holds, so `SceneEditor` keeps it as a
 * field the way `SceneEditorView` keeps `EditorPages`. All arithmetic
 * lives in `sheet-detents.ts`; this class only measures, applies and
 * listens.
 */
export class SheetDetentController {
  private readonly _hosts: SheetDetentHosts
  private readonly _onChanged: (detent: SheetDetent) => void

  private _detent: SheetDetent = 'peek'
  private _height = -1
  private _animation: Adw.SpringAnimation | null = null
  private _dragFrom = 0
  private _samples: SheetDragSample[] = []

  constructor(hosts: SheetDetentHosts, onChanged: (detent: SheetDetent) => void) {
    this._hosts = hosts
    this._onChanged = onChanged
    this._wireGrabber()
    this._wireScroller()
    // libadwaita's own swipe tracker and a tap on the bottom bar both
    // move `open` behind our back, so the detent follows it rather than
    // owning it alone.
    hosts.sheet.connect('notify::open', () => this._onOpenChanged())
  }

  get detent(): SheetDetent {
    return this._detent
  }

  /** Window height and docked-bar height, as GTK has them right now. */
  get metrics(): SheetMetrics {
    return {
      windowHeight: this._hosts.canvas.get_height(),
      barHeight: this._hosts.sheet.get_bottom_bar_height(),
    }
  }

  /** How far the camera has to duck, in px (`Engine.setViewportInset`). */
  get bottomInset(): number {
    return bottomInsetFor(this._detent, this.metrics)
  }

  /**
   * Move to `detent`. Animated only between two OPEN detents: crossing
   * Peek means crossing closed↔open, and libadwaita already animates
   * that — springing the height at the same time would animate twice.
   */
  setDetent(detent: SheetDetent): void {
    const bothOpen = this._detent !== 'peek' && detent !== 'peek'
    const changed = this._detent !== detent
    this._detent = detent
    const height = detentHeight(detent, this.metrics)
    if (bothOpen) this._animateTo(height)
    else {
      this._stopAnimation()
      this._applyHeight(height)
    }
    // Peek IS the closed sheet: the bar is what a closed sheet shows.
    this._hosts.sheet.set_open(detent !== 'peek')
    // Only Full takes the input away from the map — at Half a stroke has
    // to still reach the canvas beside the sheet.
    this._hosts.sheet.set_modal(detent === 'full')
    if (changed) this._onChanged(detent)
  }

  /**
   * Re-measure after a resize. Called from `vfunc_size_allocate`, hence
   * the equality guard inside {@link _applyHeight}: a `set_size_request`
   * that changes nothing would queue a relayout forever.
   */
  reapply(): void {
    if (this._animation) return
    if (this._applyHeight(detentHeight(this._detent, this.metrics))) this._onChanged(this._detent)
  }

  private _wireGrabber(): void {
    const drag = new Gtk.GestureDrag()
    // Deliberately NOT claimed on `drag-begin`: that would swallow the
    // tap. The claim happens in `drag-update` at SHEET_DRAG_CLAIM_PX,
    // which is still well inside GTK's own 16 px threshold, so the
    // sheet's ancestor swipe tracker never gets the sequence.
    drag.connect('drag-begin', () => {
      this._stopAnimation()
      this._dragFrom = this._height >= 0 ? this._height : detentHeight(this._detent, this.metrics)
      this._samples = []
    })
    drag.connect('drag-update', (gesture, _offsetX, offsetY) => {
      this._samples.push({ offsetY, timeMs: gesture.get_current_event_time() })
      if (this._samples.length > SHEET_SAMPLE_WINDOW) this._samples.shift()
      if (Math.abs(offsetY) >= SHEET_DRAG_CLAIM_PX) gesture.set_state(Gtk.EventSequenceState.CLAIMED)
      // A finger moving DOWN shrinks the sheet, hence the subtraction.
      this._applyHeight(clampSheetHeight(this._dragFrom - offsetY, this.metrics))
    })
    drag.connect('drag-end', (_gesture, _offsetX, offsetY) => {
      const velocityY = dragVelocityY(this._samples)
      this._samples = []
      // Under the claim distance this was a tap; the click gesture owns
      // it, and the height never moved far enough to need a snap.
      if (Math.abs(offsetY) < SHEET_DRAG_CLAIM_PX) return
      this.setDetent(releaseDetent({ current: this._detent, height: this._height, velocityY, metrics: this.metrics }))
    })
    this._hosts.grabber.add_controller(drag)

    const click = new Gtk.GestureClick()
    // Only reached when the drag did not claim the sequence.
    click.connect('released', () => this.setDetent(cycleDetent(this._detent)))
    this._hosts.grabber.add_controller(click)
  }

  private _wireScroller(): void {
    const scroll = new Gtk.EventControllerScroll({
      flags: Gtk.EventControllerScrollFlags.VERTICAL,
      // Ahead of the scrolled window's own controller. Safe because the
      // event is only consumed when the list is already at its top, so
      // there is nothing the scrolled window could have done with it.
      propagationPhase: Gtk.PropagationPhase.CAPTURE,
    })
    scroll.connect('scroll', (_controller, _deltaX, deltaY) => {
      const atTop = (this._hosts.scroller.get_vadjustment()?.get_value() ?? 0) === 0
      if (deltaY >= 0 || !atTop || this._detent === 'peek') return false
      this.setDetent(nextDetent(this._detent, 'down'))
      return true
    })
    this._hosts.scroller.add_controller(scroll)
  }

  /** Reconcile a detent with an `open` somebody else moved. */
  private _onOpenChanged(): void {
    const open = this._hosts.sheet.get_open()
    if (open && this._detent === 'peek') this.setDetent('half')
    else if (!open && this._detent !== 'peek') this.setDetent('peek')
  }

  /** @returns whether the height actually moved. */
  private _applyHeight(height: number): boolean {
    const next = Math.round(height)
    if (this._height === next) return false
    this._height = next
    this._hosts.view.set_size_request(-1, next)
    return true
  }

  private _animateTo(height: number): void {
    this._stopAnimation()
    const from = this._height
    if (from === Math.round(height)) return
    // Nothing has been applied yet — there is no "from" to spring out of.
    if (from < 0) {
      this._applyHeight(height)
      return
    }
    const animation = new Adw.SpringAnimation({
      widget: this._hosts.view,
      valueFrom: from,
      valueTo: height,
      springParams: Adw.SpringParams.new(SHEET_SPRING.dampingRatio, SHEET_SPRING.mass, SHEET_SPRING.stiffness),
      target: Adw.CallbackAnimationTarget.new((value) => {
        this._applyHeight(value)
      }),
      // Without this the spring overshoots Full and the sheet briefly
      // covers the strip of map that makes it dismissable.
      clamp: true,
    })
    animation.connect('done', () => {
      if (this._animation === animation) this._animation = null
    })
    this._animation = animation
    animation.play()
  }

  private _stopAnimation(): void {
    this._animation?.pause()
    this._animation = null
  }
}
