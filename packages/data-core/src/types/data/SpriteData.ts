import type { SpriteDataBase } from './index'
import { isSpriteDataBase } from './SpriteDataBase'

/**
 * Represents a sprite instance placed in a map.
 * Extends SpriteDataBase with positioning and sprite reference information.
 *
 * @interface SpriteDataMap
 * @extends SpriteDataBase
 * @since 0.1.0
 */
export interface SpriteDataMap extends SpriteDataBase {
  /**
   * X coordinate in tile units (not pixels).
   * Represents the horizontal position on the tile grid.
   *
   * @type {number}
   * @minimum 0
   */
  x: number

  /**
   * Y coordinate in tile units (not pixels).
   * Represents the vertical position on the tile grid.
   *
   * @type {number}
   * @minimum 0
   */
  y: number

  /**
   * Reference to the sprite set containing this sprite.
   * Must correspond to a sprite set defined in the map's spriteSets array.
   *
   * @type {string}
   */
  spriteSetId: string

  /**
   * Reference to the sprite definition in the sprite set.
   * Index of the sprite within the sprite set's sprite array.
   *
   * @type {number}
   * @minimum 0
   */
  spriteId: number

  /**
   * Optional reference to an animation sequence.
   * If specified, the sprite will use the named animation instead of a static sprite.
   *
   * @type {string}
   * @optional
   */
  animationId?: string

  /**
   * Optional z-index for layering within the same tile.
   * Higher values appear above lower values. Defaults to 0.
   *
   * @type {number}
   * @optional
   * @default 0
   */
  zIndex?: number
}

/**
 * Type guard to check if an object implements SpriteDataMap interface.
 *
 * @param obj - The object to check
 * @returns True if the object implements SpriteDataMap
 *
 * @example
 * ```typescript
 * if (isSpriteDataMap(obj)) {
 *   console.log('Sprite at position:', obj.x, obj.y);
 * }
 * ```
 */
export function isSpriteDataMap(obj: unknown): obj is SpriteDataMap {
  return (
    isSpriteDataBase(obj) &&
    typeof (obj as SpriteDataMap).x === 'number' &&
    typeof (obj as SpriteDataMap).y === 'number' &&
    typeof (obj as SpriteDataMap).spriteSetId === 'string' &&
    typeof (obj as SpriteDataMap).spriteId === 'number' &&
    ((obj as SpriteDataMap).animationId === undefined ||
      typeof (obj as SpriteDataMap).animationId === 'string') &&
    ((obj as SpriteDataMap).zIndex === undefined ||
      typeof (obj as SpriteDataMap).zIndex === 'number')
  )
}

// Re-export the interface with the original name for backward compatibility
export type SpriteData = SpriteDataMap
