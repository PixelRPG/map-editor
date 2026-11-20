import { type Scene, System, SystemType, type World } from 'excalibur'
import { ZoomLimitsComponent } from '../components/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { SessionState } from '../utils/session-state.ts'
import { fitMinZoom, wantsDotLod } from '../utils/zoom.ts'

/**
 * Keeps {@link ZoomLimitsComponent} true: the per-map zoom-out limit
 * (the whole map fits the viewport, plus a margin) and the far-zoom
 * level-of-detail flag (`dots`).
 *
 * Polled rather than event-driven because the two inputs — the drawing
 * surface and the camera zoom — change through several paths (a window
 * resize, a wheel notch, a pinch, a Control call, a map switch carrying
 * the zoom) and polling three numbers per frame is cheaper than
 * threading a notification through each. Nothing allocates unless a
 * value actually changed.
 *
 * When the zoom sits below a freshly raised minimum (the window shrank,
 * a map switch kept the old zoom) it is clamped DIRECTLY, not eased: the
 * view is already showing void the map cannot fill, and an animation
 * would play through exactly that.
 *
 * One system per scene, so a retired map's system never touches the
 * current camera.
 */
export class ZoomLimitsSystem extends System {
  public readonly systemType = SystemType.Update

  private scene?: Scene

  constructor(private readonly mapResource: MapResource) {
    super()
  }

  public onInitialize(world: World, scene: Scene): void {
    if (super.onInitialize) super.onInitialize(world, scene)
    this.scene = scene
    if (!SessionState.get(scene, ZoomLimitsComponent)) {
      SessionState.set(scene, new ZoomLimitsComponent(EDITOR_CONSTANTS.ABSOLUTE_MIN_ZOOM, EDITOR_CONSTANTS.MAX_ZOOM))
    }
  }

  public onUpdate(_elapsed: number): void {
    const scene = this.scene
    const engine = scene?.engine
    const mapData = this.mapResource.mapData
    if (!scene || !engine || !mapData || engine.currentScene !== scene) return
    const limits = SessionState.get(scene, ZoomLimitsComponent)
    if (!limits) return

    const tileWidth = mapData.tileWidth ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE
    const tileHeight = mapData.tileHeight ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE
    const resolution = engine.screen.resolution
    const min = fitMinZoom({
      map: { width: mapData.columns * tileWidth, height: mapData.rows * tileHeight },
      viewport: resolution,
      margin: EDITOR_CONSTANTS.FIT_MARGIN,
      floor: EDITOR_CONSTANTS.ABSOLUTE_MIN_ZOOM,
    })

    const camera = scene.camera
    if (camera.zoom < min) camera.zoom = min
    // An axis on which the whole map fits has nothing to pan to: hold it
    // centred, so the fully zoomed-out map sits in the middle of the view
    // instead of wherever the camera happened to be.
    const mapWidth = mapData.columns * tileWidth
    const mapHeight = mapData.rows * tileHeight
    if (mapWidth * camera.zoom <= resolution.width && camera.x !== mapWidth / 2) camera.x = mapWidth / 2
    if (mapHeight * camera.zoom <= resolution.height && camera.y !== mapHeight / 2) camera.y = mapHeight / 2
    const dots = wantsDotLod(
      camera.zoom,
      Math.min(tileWidth, tileHeight),
      EDITOR_CONSTANTS.LOD_DOT_TILE_PX,
      limits.dots,
    )

    if (min === limits.min && dots === limits.dots) return
    const dotsChanged = dots !== limits.dots
    limits.min = min
    limits.dots = dots
    SessionState.notifyMutation(scene, limits)
    if (dotsChanged) (scene as MapScene).setPlacementDots(dots)
  }
}
