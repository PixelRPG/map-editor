import { type EventEmitter, type Engine as ExcaliburEngine, Vector } from 'excalibur'
import { worldToTile } from '../services/tile-geometry.ts'
import type { EngineEventMap } from '../types/index.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { type ActiveSceneAccessor, rebindOnMapLoaded } from './scene-binding.ts'

/** Pointer world position, already camera/zoom-resolved by Excalibur. */
export interface PointerWorldEvent {
  readonly sceneId: string
  readonly worldX: number
  readonly worldY: number
}

/** Pointer position in tile space over the active map. */
export interface PointerTileEvent {
  readonly sceneId: string
  readonly tileX: number
  readonly tileY: number
}

export interface PointerObserverHost {
  readonly excalibur: ExcaliburEngine
  readonly events: EventEmitter<EngineEventMap>
  readonly activeScene: ActiveSceneAccessor
}

/**
 * Opt-in coord trace — set `globalThis.__PIXELRPG_CURSOR_DEBUG = true`
 * in DevTools / a debugger session to dump screen→world conversions.
 * Used to investigate the 2026-06-01 "remote cursor is ~3 tiles off"
 * report: paint (POINTER_TAP) and cursor (this path) read `screenPos`
 * from the same source AND call `screenToWorldCoordinates` identically,
 * so if the logged world position matches the painted tile the offset is
 * on the receiver / actor render side; if it doesn't, the offset is a
 * `pointer.on('move')` vs `pointer.on('down/up')` screenPos divergence.
 */
function traceCursor(excalibur: ExcaliburEngine, screenPos: { x: number; y: number }, world: Vector): void {
  if ((globalThis as { __PIXELRPG_CURSOR_DEBUG?: boolean }).__PIXELRPG_CURSOR_DEBUG !== true) return
  const cam = excalibur.currentScene?.camera
  console.log(
    `[cursor-debug] screen=(${screenPos.x.toFixed(1)},${screenPos.y.toFixed(1)})` +
      ` → world=(${world.x.toFixed(1)},${world.y.toFixed(1)})` +
      ` camera=(${cam?.x.toFixed(1) ?? '?'},${cam?.y.toFixed(1) ?? '?'},zoom=${cam?.zoom.toFixed(2) ?? '?'})`,
  )
}

/**
 * Attach `handler` to the primary pointer's `move` and re-attach it
 * across map switches. Returns a disposer, or `null` when no pointer is
 * available yet — the shared half of both observers below.
 */
function observePointerMove(
  host: PointerObserverHost,
  makeHandler: () => (event: { screenPos: { x: number; y: number } }) => void,
): () => void {
  return rebindOnMapLoaded(host.events, () => {
    const pointer = host.excalibur?.input?.pointers?.primary
    if (!pointer) return null
    const handler = makeHandler()
    pointer.on('move', handler)
    return () => pointer.off('move', handler)
  })
}

/**
 * Subscribe to the primary pointer's world-space position.
 *
 * Used by the awareness layer to broadcast the local user's cursor to
 * remote peers. Fires on every Excalibur `pointermove` — the caller is
 * expected to throttle (`AwarenessManager` does, via
 * `cursorThrottleMs`). The `sceneId` (== map id) lets the receiver drop
 * frames for scenes it is not currently viewing.
 */
export function observePointerWorld(host: PointerObserverHost, cb: (event: PointerWorldEvent) => void): () => void {
  return observePointerMove(host, () => (event) => {
    const scene = host.activeScene()
    if (!scene) return
    const sceneId = scene.mapResource.mapData.id
    if (!sceneId) return
    const world = host.excalibur.screen.screenToWorldCoordinates(new Vector(event.screenPos.x, event.screenPos.y))
    traceCursor(host.excalibur, event.screenPos, world)
    cb({ sceneId, worldX: world.x, worldY: world.y })
  })
}

/**
 * Subscribe to the primary pointer's tile-space position.
 *
 * Like {@link observePointerWorld} but deduped at tile granularity: the
 * callback fires only when the pointer crosses a tile boundary, which is
 * the right cadence for the OSD coord readout — once per actual tile
 * transition rather than once per pixel of motion. Coordinates are NOT
 * clamped to the map (see {@link worldToTile}).
 *
 * The dedupe state resets per binding, so a map switch always reports
 * the first tile the pointer lands on.
 */
export function observePointerTile(host: PointerObserverHost, cb: (event: PointerTileEvent) => void): () => void {
  return observePointerMove(host, () => {
    let lastTileX: number | null = null
    let lastTileY: number | null = null
    return (event) => {
      const scene = host.activeScene()
      const mapData = scene?.mapResource?.mapData
      if (!mapData?.id) return
      const world = host.excalibur.screen.screenToWorldCoordinates(new Vector(event.screenPos.x, event.screenPos.y))
      const { x: tileX, y: tileY } = worldToTile(
        world.x,
        world.y,
        mapData.tileWidth || EDITOR_CONSTANTS.DEFAULT_TILE_SIZE,
        mapData.tileHeight || EDITOR_CONSTANTS.DEFAULT_TILE_SIZE,
      )
      if (tileX === lastTileX && tileY === lastTileY) return
      lastTileX = tileX
      lastTileY = tileY
      cb({ sceneId: mapData.id, tileX, tileY })
    }
  })
}
