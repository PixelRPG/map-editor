import type { SpriteDataSet } from '../types/data/index.ts'

/**
 * Whether a single sprite reference makes the tile it sits on solid.
 *
 * Priority:
 *
 *   1. `placementSolid` — explicit per-placement override. Only the
 *      load-time path carries this; live edits via `MapEditorComponent`
 *      lose the field (pre-existing limitation — there is no UI for
 *      placement-level overrides yet).
 *   2. `definition.solid` — the sprite-set wall flag (Tiles tab Solid
 *      switch + the Tiled `<objectgroup>` porter). An explicit `false`
 *      wins over the walkable fallback below.
 *   3. `definition.tileProperties.walkable === false` — the semantic
 *      "can't walk here" path, which also carries surface metadata.
 *
 * `false` when none of the above declares solidity. Callers union the
 * answer across the stacked refs on a tile to get "any sprite blocks".
 */
export function isSpriteRefSolid(definition: SpriteDataSet | undefined, placementSolid?: boolean): boolean {
  if (placementSolid !== undefined) return placementSolid
  if (definition?.solid === true) return true
  if (definition?.solid === false) return false
  return definition?.tileProperties?.walkable === false
}
