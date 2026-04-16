import {
  Engine,
  Scene,
  System,
  SystemType,
  World,
  vec,
  Vector,
} from 'excalibur'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'

/**
 * Camera pan and zoom for the editor scene.
 *
 * Subscribes directly to `ex.Input.Pointer` events. Holds its own pan-anchor
 * state — pan is purely a camera concern, no shared component needed.
 *
 * GTK-quirk note: `@gjsify/event-bridge` historically reports pointer-down
 * coordinates in widget-local space and pointer-move coordinates in
 * surface-local space, so we deliberately *don't* trust the down-position.
 * The first move-after-down sets the anchor, subsequent moves pan from there
 * — keeping everything inside a single coordinate frame.
 */
export class CameraControlSystem extends System {
  public readonly systemType = SystemType.Update

  private engine?: Engine
  private isDown = false
  private dragAnchor: Vector | null = null

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) {
      super.initialize(world, scene)
    }

    this.engine = scene.engine

    const pointer = this.engine.input.pointers.primary

    pointer.on('down', () => {
      this.isDown = true
      this.dragAnchor = null
    })

    pointer.on('move', (event) => {
      if (!this.isDown || !this.engine) return
      const screenPos = vec(event.screenPos.x, event.screenPos.y)
      if (!this.dragAnchor) {
        this.dragAnchor = screenPos
        return
      }
      const zoom = this.engine.currentScene.camera.zoom || 1
      const deltaX = (screenPos.x - this.dragAnchor.x) / zoom
      const deltaY = (screenPos.y - this.dragAnchor.y) / zoom
      this.engine.currentScene.camera.x -= deltaX
      this.engine.currentScene.camera.y -= deltaY
      this.dragAnchor = screenPos
    })

    pointer.on('up', () => {
      this.isDown = false
      this.dragAnchor = null
    })

    pointer.on('cancel', () => {
      this.isDown = false
      this.dragAnchor = null
    })

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
