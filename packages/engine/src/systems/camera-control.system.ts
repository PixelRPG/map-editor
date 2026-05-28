import { type Engine, type EventEmitter, type Scene, System, SystemType, type World } from 'excalibur'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'

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
 * Zoom still rides on raw `pointer.on('wheel')` since the wheel
 * doesn't participate in tap/drag negotiation.
 */
export class CameraControlSystem extends System {
  public readonly systemType = SystemType.Update

  private engine?: Engine

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) {
      super.initialize(world, scene)
    }

    this.engine = scene.engine

    this.events.on(EngineEvent.POINTER_DRAG_MOVE, ({ deltaX, deltaY }) => {
      if (!this.engine) return
      const zoom = this.engine.currentScene.camera.zoom || 1
      this.engine.currentScene.camera.x -= deltaX / zoom
      this.engine.currentScene.camera.y -= deltaY / zoom
    })

    const pointer = this.engine.input.pointers.primary
    pointer.on('wheel', (event) => {
      if (!this.engine) return
      const direction = event.deltaY > 0 ? -1 : 1
      let zoom = this.engine.currentScene.camera.zoom
      zoom += direction * EDITOR_CONSTANTS.ZOOM_STEP
      if (zoom <= EDITOR_CONSTANTS.MIN_ZOOM) {
        zoom = EDITOR_CONSTANTS.MIN_ZOOM
      }
      this.engine.currentScene.camera.zoom = Math.round(zoom * 10) / 10
    })
  }

  public update(_elapsed: number): void {
    // Camera state is event-driven; no per-frame work.
  }
}
