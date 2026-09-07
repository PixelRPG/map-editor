import type { Engine as ExcaliburEngine } from 'excalibur'
import { vec } from 'excalibur'
import { tileToWorldCenter } from '../services/tile-geometry.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import type { ActiveSceneAccessor } from './scene-binding.ts'

/** The slice of the engine a synthetic pointer move needs. */
export interface PointerSynthesisHost {
  readonly excalibur: Pick<ExcaliburEngine, 'input'>
  readonly activeScene: ActiveSceneAccessor
}

/**
 * Move the primary pointer to the centre of tile `(tileX, tileY)` on
 * the active map — the headless twin of a real mouse move, for the
 * Control plane and tests.
 *
 * Goes through Excalibur's own `PointerEventReceiver.triggerEvent`, so
 * the move takes the exact path a GTK motion event takes (DOM
 * `pointermove` → receiver → `PointerSystem` → every `pointer.on('move')`
 * subscriber, the hover overlays included). Nothing here talks to the
 * overlays directly: a preview that only a synthetic path can reach
 * would prove nothing about the real one.
 *
 * Returns `false` without an active map. Deliberately unbounded like
 * the pointer itself: a tile past the map's edge lands the cursor
 * there, and the hit test decides what that means.
 */
export function synthesizePointerMoveAtTile(host: PointerSynthesisHost, tileX: number, tileY: number): boolean {
  const mapData = host.activeScene()?.mapResource?.mapData
  if (!mapData) return false
  const centre = tileToWorldCenter(
    mapData.pos ?? { x: 0, y: 0 },
    mapData.tileWidth || EDITOR_CONSTANTS.DEFAULT_TILE_SIZE,
    mapData.tileHeight || EDITOR_CONSTANTS.DEFAULT_TILE_SIZE,
    tileX,
    tileY,
  )
  host.excalibur.input.pointers.triggerEvent('move', vec(centre.x, centre.y))
  return true
}
