import type { ObjectPlacement } from '../types/data/index.ts'

/**
 * Pick the placement a click at `(tileX, tileY)` should select.
 *
 * Placements stack: several can occupy the same tile across different
 * layers. `MapResource` renders later array entries above earlier ones,
 * so the LAST match is the one the user sees on top — scanning
 * backwards makes the pick agree with what is drawn, the same rule the
 * eyedropper uses for stacked sprites.
 *
 * `null` for an empty tile, which the select tool treats as "clear the
 * selection".
 */
export function pickTopmostPlacementAt(
  placements: readonly ObjectPlacement[],
  tileX: number,
  tileY: number,
): ObjectPlacement | null {
  for (let i = placements.length - 1; i >= 0; i--) {
    const placement = placements[i]
    if (placement.tileX === tileX && placement.tileY === tileY) return placement
  }
  return null
}
