import type { Properties, SpriteDataMap } from './index'

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
