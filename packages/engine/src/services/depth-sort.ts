import { zFor } from '../components/tilemap-plane.component.ts'
import type { LayerPlane } from '../types/data/LayerData.ts'

/**
 * Z span a sorted thing may use inside the hero plane: from
 * `zFor('hero') + 1` (just above the plane's tilemap) to
 * `zFor('hero') + 1 + DEPTH_BAND`, which stays under the overlay plane.
 */
export const DEPTH_BAND = 98

/** What {@link depthZ} needs to place one thing in the draw order. */
export interface DepthInput {
  plane: LayerPlane
  /** Map-space y of the bottom edge of the thing's picture. */
  footY: number
  /** Height of the whole map in pixels (rows × tile height). */
  mapHeightPx: number
  /** Storey, as in {@link zFor}. Absent = 0. */
  elevation?: number
}

/** Only the hero plane interleaves its actors; ground and overlay stay flat. */
export function isDepthSorted(plane: LayerPlane): boolean {
  return plane === 'hero'
}

/**
 * The render z of one thing. Off the hero plane this is exactly
 * {@link zFor}; on it, z grows with the foot's y so whatever stands
 * further south draws over whatever stands further north. Equal z keeps
 * insertion order, which is map-file order and so the same on every peer.
 *
 * Takes one object so a later per-placement override (always behind /
 * always in front) can add a field without reshaping callers.
 */
export function depthZ({ plane, footY, mapHeightPx, elevation = 0 }: DepthInput): number {
  const base = zFor(plane, elevation)
  if (!isDepthSorted(plane)) return base
  const fraction = mapHeightPx > 0 ? Math.min(1, Math.max(0, footY / mapHeightPx)) : 0
  return base + 1 + fraction * DEPTH_BAND
}

/** Map height in pixels from the map's own grid; 0 when it is not loaded. */
export function mapHeightPx(mapData: { rows: number; tileHeight: number } | null | undefined): number {
  return mapData ? mapData.rows * mapData.tileHeight : 0
}
