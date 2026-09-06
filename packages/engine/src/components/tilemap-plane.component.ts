import { Component } from 'excalibur'
import type { LayerPlane } from '../types/data/LayerData.ts'

/**
 * Attached to every Excalibur `TileMap` entity built by
 * {@link MapResource}. Identifies which {@link LayerPlane} the
 * tilemap renders.
 *
 * Used by every code path that needs to pick the *right* tilemap
 * from a scene with multiple — `TileEditorSystem` (route paint /
 * erase to the active layer's plane), `SetLayerVisibilityCommand`
 * (refresh only the affected tilemap), the visibility helpers in
 * `tile-graphics.manager`. Without the marker, callers would have
 * to guess by name or iteration order.
 *
 * Z-index is set on the TileMap entity directly via {@link zFor},
 * not stored here — components carry semantic intent, not render
 * state.
 */
export class TileMapPlaneComponent extends Component {
  constructor(public readonly plane: LayerPlane) {
    super()
  }
}

/**
 * Z offset of each plane INSIDE one storey. The gaps are wide enough
 * for actors to interleave (the player sits at `zFor('hero') + 50`,
 * placements at exactly their layer's plane z) without colliding with
 * the adjacent tilemaps. Deliberately not exported: {@link zFor} is
 * the only way any code obtains a tilemap or actor z, so nothing can
 * treat 0 / 100 / 200 as an exhaustive enum once storeys exist.
 */
const PLANE_Z: Record<LayerPlane, number> = {
  ground: 0,
  hero: 100,
  overlay: 200,
}

/**
 * Z distance between two storeys. Larger than any plane offset plus
 * actor offset, so storey 1's ground (1000) sits above storey 0's
 * overlay (200) and everything drawn on it.
 */
export const STOREY_Z_STRIDE = 1000

/**
 * The render z of anything on `plane` at storey `elevation`: the
 * tilemap of that plane, a placement on a layer of that plane, or an
 * actor offset from it. `elevation` is `LayerData.elevation` (absent =
 * 0); today every caller passes the default, because the elevation
 * runtime is not built yet — the parameter exists so the formula, and
 * not just the three offsets, is what the code pins.
 */
export function zFor(plane: LayerPlane, elevation = 0): number {
  return elevation * STOREY_Z_STRIDE + PLANE_Z[plane]
}
