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
