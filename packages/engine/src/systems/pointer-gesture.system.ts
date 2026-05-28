import { type Engine, type EventEmitter, type Scene, System, SystemType, type Vector, vec, type World } from 'excalibur'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'

/**
 * Screen-space distance (px) a pointer must travel while pressed
 * before a press is reinterpreted as a drag. Below this we treat
 * release as a tap. Matches GTK's default `Gtk.GestureDrag` drag
 * threshold (~8 px) at zoom 1; 5 keeps it slightly tighter for
 * editor precision.
 */
const DRAG_THRESHOLD_PX = 5

/**
 * Discriminates raw pointer events into high-level gestures.
 *
 * Mirrors the GTK4 gesture-claim mechanism (`Gtk.GestureClick` ⇄
 * `Gtk.GestureDrag`) inside the Excalibur input layer: a press is
 * tentatively a tap; once the pointer crosses {@link DRAG_THRESHOLD_PX}
 * of accumulated screen-space movement the press is reinterpreted
 * as a drag and `POINTER_TAP` is suppressed for that sequence.
 *
 * Emits four events on the engine's typed event bus:
 *
 * - {@link EngineEvent.POINTER_TAP} — press + release with no drag
 *   crossing. Carries the original press position. This is what
 *   tools (pencil paint, bucket fill, eyedropper, future
 *   selection-tool single-click) should listen to instead of raw
 *   `pointer.on('down')`. Without this layer a left-click-and-drag
 *   pan would also paint at the press tile because the tools
 *   reacted on `down` before drag intent was known.
 *
 * - {@link EngineEvent.POINTER_DRAG_START} — drag confirmed. Carries
 *   the original press position (the drag anchor), not where the
 *   threshold was crossed, so pan / future rect-select tools can
 *   compute deltas from a stable origin.
 *
 * - {@link EngineEvent.POINTER_DRAG_MOVE} — each subsequent
 *   pointer-move during a drag. Delta is INCREMENTAL (since the
 *   previous emit), matching how `CameraControlSystem` already
 *   chains pan increments.
 *
 * - {@link EngineEvent.POINTER_DRAG_END} — pointer-up or
 *   pointer-cancel during a drag. Consumers should treat both the
 *   same: clean up drag-local state, no further deltas will arrive.
 *
 * The system intentionally does NOT swallow raw pointer events —
 * other systems can still subscribe to `pointer.on('move')` for
 * hover (e.g. `TileEditorSystem`'s hover-preview), `pointer.on('wheel')`
 * for zoom, etc. Only the press/release/drag triad is consolidated.
 *
 * Must run before any system that listens to the high-level events,
 * but since both producer and consumers register on the same engine
 * event bus during `initialize()`, ordering is only structural —
 * pointer events themselves fire after the whole world is up.
 */
export class PointerGestureSystem extends System {
  public readonly systemType = SystemType.Update

  private engine?: Engine
  /** Press anchor — null when no press is active. */
  private pressPos: Vector | null = null
  /** Previous pointer position for incremental delta on drag-move. */
  private lastPos: Vector | null = null
  /** Whether the current sequence has been reinterpreted as a drag. */
  private dragging = false

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) {
      super.initialize(world, scene)
    }
    this.engine = scene.engine
    const pointer = this.engine.input.pointers.primary

    pointer.on('down', (event) => {
      const p = vec(event.screenPos.x, event.screenPos.y)
      this.pressPos = p
      this.lastPos = p
      this.dragging = false
    })

    pointer.on('move', (event) => {
      if (!this.pressPos || !this.lastPos) return
      const p = vec(event.screenPos.x, event.screenPos.y)
      if (!this.dragging) {
        if (p.distance(this.pressPos) > DRAG_THRESHOLD_PX) {
          this.dragging = true
          this.events.emit(EngineEvent.POINTER_DRAG_START, {
            screenPos: { x: this.pressPos.x, y: this.pressPos.y },
          })
        }
      }
      if (this.dragging) {
        this.events.emit(EngineEvent.POINTER_DRAG_MOVE, {
          screenPos: { x: p.x, y: p.y },
          deltaX: p.x - this.lastPos.x,
          deltaY: p.y - this.lastPos.y,
        })
      }
      this.lastPos = p
    })

    pointer.on('up', (event) => {
      if (this.dragging) {
        this.events.emit(EngineEvent.POINTER_DRAG_END, {
          screenPos: { x: event.screenPos.x, y: event.screenPos.y },
        })
      } else if (this.pressPos) {
        // Tap fires at the ORIGINAL press position, not the release —
        // a sub-threshold finger wobble shouldn't shift which tile
        // gets painted.
        this.events.emit(EngineEvent.POINTER_TAP, {
          screenPos: { x: this.pressPos.x, y: this.pressPos.y },
        })
      }
      this.reset()
    })

    pointer.on('cancel', () => {
      if (this.dragging && this.lastPos) {
        // Excalibur's cancel callback has no typed payload — fall back
        // to the last-known position so consumers still get a coherent
        // end position to clean up against.
        this.events.emit(EngineEvent.POINTER_DRAG_END, {
          screenPos: { x: this.lastPos.x, y: this.lastPos.y },
        })
      }
      this.reset()
    })
  }

  public update(_elapsed: number): void {
    // Gesture state is event-driven; no per-frame work.
  }

  private reset(): void {
    this.pressPos = null
    this.lastPos = null
    this.dragging = false
  }
}
