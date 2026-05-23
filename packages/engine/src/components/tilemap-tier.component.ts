import { Component } from 'excalibur'
import type { LayerTier } from '../types/data/LayerData.ts'

/**
 * Attached to every Excalibur `TileMap` entity built by
 * {@link MapResource}. Identifies which {@link LayerTier} the
 * tilemap renders.
 *
 * Used by every code path that needs to pick the *right* tilemap
 * from a scene with multiple — `TileEditorSystem` (route paint /
 * erase to the active layer's tier), `Engine.setLayerVisible`
 * (refresh only the affected tilemap), the visibility helpers in
 * `tile-graphics.manager`. Without the marker, callers would have
 * to guess by name or iteration order.
 *
 * Z-index is set on the TileMap entity directly (one of
 * `TIER_Z.ground` / `.hero` / `.overlay`), not stored here —
 * components carry semantic intent, not render state.
 */
export class TileMapTierComponent extends Component {
  constructor(public readonly tier: LayerTier) {
    super()
  }
}

/**
 * Render z per tier. The gaps are wide enough for actors and
 * placements to interleave (decorations sit at z=hero, the
 * player would also sit at z=hero) without colliding with the
 * adjacent tilemaps. Specific values are arbitrary — they just
 * need to be ordered + non-overlapping with actor offsets.
 */
export const TIER_Z: Record<LayerTier, number> = {
  ground: 0,
  hero: 100,
  overlay: 200,
}
