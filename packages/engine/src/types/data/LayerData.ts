import type { Properties, SpriteDataMap } from './index'

/**
 * Rendering tier a {@link LayerData} belongs to. Maps directly to
 * which Excalibur `TileMap` entity the layer's tile sprites render
 * on:
 *
 * - **ground** — under the player (z = 0). Floors, paths, water,
 *   the static "you walk on this" world.
 * - **hero** — same render plane as the player (z = 100).
 *   Decoration objects (rocks, shrubs, signs) live here so the
 *   player passes them at the same depth.
 * - **overlay** — over the player (z = 200). Treetops, ceilings,
 *   anything that should obscure the player from above.
 *
 * Optional + defaults to `'ground'` when missing — legacy map files
 * that predate the tier model continue to render as a single
 * ground-tier tilemap, matching the pre-refactor behaviour.
 *
 * Layers that only host functional placements (collision /
 * trigger / camera markers, no visible sprites) typically leave
 * `tier` unset and `visible: false`. The engine doesn't render
 * them on any tilemap; `ObjectSpawnSystem` still spawns their
 * placement entities for runtime systems to consume.
 */
export type LayerTier = 'ground' | 'hero' | 'overlay'

/**
 * One layer within a tile map. Every layer is a tile layer in the
 * object-system schema; the legacy `type: 'tile' | 'object'` split
 * is gone. Objects live in {@link MapData}.objectPlacements and
 * reference any layer's `id` via `layerId` for sort/visibility
 * grouping.
 *
 * See `docs/concepts/object-system.md`.
 */
export interface LayerData {
  /** Unique identifier for the layer */
  id: string

  /** Display name of the layer */
  name: string

  /** Whether the layer should be rendered */
  visible: boolean

  /**
   * Whether the layer is locked against editing. When true, tile
   * paint / erase commands targeting this layer are rejected by
   * `TileEditorSystem`, and the host's editing tools (pencil /
   * eraser / bucket / rect) grey out when this is the active layer.
   * Pure editor concern — runtime systems ignore the flag.
   *
   * Optional + defaults to false so existing project files without
   * the field continue to work.
   */
  locked?: boolean

  /**
   * Render tier this layer's tile sprites paint to. See
   * {@link LayerTier}. Optional + defaults to `'ground'`.
   *
   * Layers carrying only placements (no tile sprites at all) may
   * leave this unset — the engine never creates a tilemap for
   * those and the placements render based on their own layer's
   * tier via `ObjectSpawnSystem`.
   */
  tier?: LayerTier

  /** Optional opacity value (0-1) */
  opacity?: number

  /** Optional z-index for layer ordering */
  zIndex?: number

  /**
   * Tile sprites placed on this layer. Empty / missing for layers
   * that purely host object placements via `layerId` (e.g. a
   * convention "events" layer).
   */
  sprites?: SpriteDataMap[]

  /** Optional custom properties for the layer */
  properties?: Properties
}
