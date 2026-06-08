import type { ImageReference } from '../reference/index'
import type { AnimationData, EditorMetadata, Properties, SpriteDataSet } from './index'

/**
 * What a sprite set is FOR — drives which gallery surfaces it:
 *  - `tileset`   → world-building tiles (Tiles view).
 *  - `character` → a character animation sheet (Cast view).
 *
 * Absent on a {@link SpriteSetData} is treated as `tileset` (back-compat
 * with projects written before the character/tileset split).
 */
export type SpriteSetKind = 'tileset' | 'character'

/**
 * Represents a sprite set that can be used in a map
 * Compatible with Excalibur.js graphics system
 */
export interface SpriteSetData {
  /**
   * Format version for compatibility
   */
  version: string

  /**
   * Unique identifier for the sprite set
   */
  id: string

  /**
   * Display name of the sprite set
   */
  name: string

  /**
   * Whether this set holds world tiles (`tileset`) or a character
   * animation sheet (`character`). Absent ⇒ `tileset`. Keeps character
   * sheets out of the Tiles gallery and vice-versa.
   */
  kind?: SpriteSetKind

  /**
   * Multiple image sources for the sprite set
   */
  image?: ImageReference

  /**
   * Width of an individual sprite in pixels
   */
  spriteWidth: number

  /**
   * Height of an individual sprite in pixels
   */
  spriteHeight: number

  /**
   * Optional margin around sprites in pixels
   */
  margin?: number

  /**
   * Optional spacing between sprites in pixels
   */
  spacing?: number

  /**
   * Array of sprite definitions in this sprite set
   * Each sprite references a specific position in a sprite sheet
   */
  sprites: SpriteDataSet[]

  /**
   * The number of sprites columns (width of the sprite set)
   */
  columns: number

  /**
   * The number of sprites rows (height of the sprite set)
   */
  rows: number

  /**
   * Array of animation definitions
   */
  animations?: AnimationData[]

  /**
   * Editor-specific metadata
   */
  editorData?: EditorMetadata

  /**
   * Optional custom properties
   */
  properties?: Properties
}
