import type { MapData } from '../types/data/index.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { type Point2, tileToWorldCenter } from './tile-geometry.ts'

/**
 * World point at the centre of the tile an object placement occupies —
 * where the camera has to sit for that placement to be centred in the
 * viewport (the inspector's "focus this object" affordance).
 *
 * `null` when the map is unloaded or the id matches no placement, so
 * the caller can treat "can't focus" as one case rather than probing
 * the map data itself.
 */
export function placementTileCentre(mapData: MapData | null | undefined, placementId: string): Point2 | null {
  const placement = mapData?.objectPlacements?.find((candidate) => candidate.id === placementId)
  if (!placement) return null
  return tileToWorldCenter(
    { x: 0, y: 0 },
    mapData?.tileWidth ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE,
    mapData?.tileHeight ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE,
    placement.tileX,
    placement.tileY,
  )
}
