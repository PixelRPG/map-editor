import { type EventEmitter, type Scene, System, SystemType, type World } from 'excalibur'
import { DragIntentComponent } from '../components/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { SessionState } from '../utils/session-state.ts'
import { SubscriptionScope } from '../utils/subscription-scope.ts'

/**
 * Camera pan and zoom for the editor scene.
 *
 * Pan rides on the high-level drag gestures from
 * {@link PointerGestureSystem} (`POINTER_DRAG_{START,MOVE,END}`) so a
 * left-click-and-release on a tile no longer drifts into a pan — the
 * gesture system only emits `POINTER_DRAG_START` after the pointer
 * has crossed the drag threshold, by which point the press is
 * already disambiguated from a tap. `TileEditorSystem` listens to
 * the complementary `POINTER_TAP` for paint, so the two never
 * compete for the same press.
 *
 * A drag, though, they DO both want: with a brush armed it paints a
 * stroke instead of panning (TERRAIN.md §6.3). That one decision is
 * `resolveDragIntent`, taken once per gesture by `TileEditorSystem`
 * and read here off `DragIntentComponent` — see the pan handler.
 *
 * Zoom still rides on raw `pointer.on('wheel')` since the wheel
 * doesn't participate in tap/drag negotiation.
 *
 * Stateless system — the scene + engine references stay captured in
 * the subscription closures installed at `onInitialize`, never on the
 * system instance.
 *
 * Both emitters it subscribes to (the engine bus and the primary
 * pointer) outlive the scene, and both handlers steer
 * `engine.currentScene.camera` — whatever map is showing. So a handler
 * left behind by a switched-away map does not go quiet, it pans the
 * CURRENT camera a second time. `dispose` is what keeps room two from
 * scrolling twice as fast as room one; `retireScene` calls it.
 */
export class CameraControlSystem extends System {
  public readonly systemType = SystemType.Update

  private readonly subscriptions = new SubscriptionScope()

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public onInitialize(world: World, scene: Scene): void {
    if (super.onInitialize) {
      super.onInitialize(world, scene)
    }

    const engine = scene.engine

    this.subscriptions.add(
      this.events.on(EngineEvent.POINTER_DRAG_MOVE, ({ deltaX, deltaY }) => {
        const scene = engine.currentScene
        // The drag router (TERRAIN.md §6.3). A one-finger drag either
        // moves the camera or paints a stroke, never both — and
        // `TileEditorSystem` is the one that can tell, so it writes the
        // answer to the session singleton at `POINTER_DRAG_START` and
        // this reads it. Absent component means pan, which is what a
        // scene with no editor (a run, a preview) always did.
        if (SessionState.get(scene, DragIntentComponent)?.intent === 'stroke') return
        const camera = scene.camera
        const zoom = camera.zoom || 1
        camera.x -= deltaX / zoom
        camera.y -= deltaY / zoom
      }),

      engine.input.pointers.primary.on('wheel', (event) => {
        const camera = engine.currentScene.camera
        const direction = event.deltaY > 0 ? -1 : 1
        let zoom = camera.zoom
        zoom += direction * EDITOR_CONSTANTS.ZOOM_STEP
        if (zoom <= EDITOR_CONSTANTS.MIN_ZOOM) {
          zoom = EDITOR_CONSTANTS.MIN_ZOOM
        }
        camera.zoom = Math.round(zoom * 10) / 10
      }),
    )
  }

  public dispose(): void {
    this.subscriptions.closeAll()
  }

  public onUpdate(_elapsed: number): void {
    // Camera state is event-driven; no per-frame work.
  }
}
