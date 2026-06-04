import { type Engine, type EventEmitter, type Scene, System, SystemType, type World } from 'excalibur'
import { PointerGestureSessionComponent } from '../components/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'

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
 * Gesture state lives on {@link PointerGestureSessionComponent} so
 * the system instance is stateless beyond the engine ref captured
 * at `initialize()`.
 */
export class PointerGestureSystem extends System {
  public readonly systemType = SystemType.Update

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) {
      super.initialize(world, scene)
    }
    if (!SessionState.get(scene, PointerGestureSessionComponent)) {
      SessionState.set(scene, new PointerGestureSessionComponent())
    }

    const engine: Engine = scene.engine
    const pointer = engine.input.pointers.primary
    const events = this.events
    const sessionFor = () => SessionState.get(scene, PointerGestureSessionComponent)

    pointer.on('down', (event) => {
      const session = sessionFor()
      if (!session) return
      session.pressX = event.screenPos.x
      session.pressY = event.screenPos.y
      session.lastX = event.screenPos.x
      session.lastY = event.screenPos.y
      session.dragging = false
    })

    pointer.on('move', (event) => {
      const session = sessionFor()
      if (!session || session.pressX === null || session.pressY === null) return
      const x = event.screenPos.x
      const y = event.screenPos.y
      if (!session.dragging) {
        const dx = x - session.pressX
        const dy = y - session.pressY
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          session.dragging = true
          events.emit(EngineEvent.POINTER_DRAG_START, {
            screenPos: { x: session.pressX, y: session.pressY },
          })
        }
      }
      if (session.dragging) {
        events.emit(EngineEvent.POINTER_DRAG_MOVE, {
          screenPos: { x, y },
          deltaX: x - session.lastX,
          deltaY: y - session.lastY,
        })
      }
      session.lastX = x
      session.lastY = y
    })

    pointer.on('up', (event) => {
      const session = sessionFor()
      if (!session) return
      if (session.dragging) {
        events.emit(EngineEvent.POINTER_DRAG_END, {
          screenPos: { x: event.screenPos.x, y: event.screenPos.y },
        })
      } else if (session.pressX !== null && session.pressY !== null) {
        // Tap fires at the ORIGINAL press position, not the release —
        // a sub-threshold finger wobble shouldn't shift which tile
        // gets painted.
        events.emit(EngineEvent.POINTER_TAP, {
          screenPos: { x: session.pressX, y: session.pressY },
        })
      }
      resetSession(session)
    })

    pointer.on('cancel', () => {
      const session = sessionFor()
      if (!session) return
      if (session.dragging) {
        // Excalibur's cancel callback has no typed payload — fall back
        // to the last-known position so consumers still get a coherent
        // end position to clean up against.
        events.emit(EngineEvent.POINTER_DRAG_END, {
          screenPos: { x: session.lastX, y: session.lastY },
        })
      }
      resetSession(session)
    })
  }

  public update(_elapsed: number): void {
    // Gesture state is event-driven; no per-frame work.
  }
}

function resetSession(session: PointerGestureSessionComponent): void {
  session.pressX = null
  session.pressY = null
  session.dragging = false
}
