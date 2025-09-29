import type { ColliderShape, Properties } from './index'

/**
 * Base interface for common sprite properties.
 * Defines the fundamental attributes that all sprite types share.
 *
 * @interface SpriteDataBase
 * @since 0.1.0
 */
export interface SpriteDataBase {
  /**
   * Whether this sprite blocks movement/collisions when used as a tile.
   * When true, entities cannot pass through this sprite in the game world.
   *
   * @type {boolean}
   * @optional
   * @default false
   */
  solid?: boolean

  /**
   * Custom properties for the sprite.
   * Allows extending sprite functionality with arbitrary key-value pairs.
   *
   * @type {Properties}
   * @optional
   */
  properties?: Properties

  /**
   * Optional collision shapes for this sprite.
   * Defines precise collision boundaries beyond simple solid blocking.
   *
   * @type {ColliderShape[]}
   * @optional
   */
  colliders?: ColliderShape[]
}

/**
 * Type guard to check if an object implements SpriteDataBase interface.
 *
 * @param obj - The object to check
 * @returns True if the object implements SpriteDataBase
 *
 * @example
 * ```typescript
 * if (isSpriteDataBase(obj)) {
 *   console.log('Object has sprite properties:', obj.solid);
 * }
 * ```
 */
export function isSpriteDataBase(obj: unknown): obj is SpriteDataBase {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (typeof (obj as SpriteDataBase).solid === 'boolean' ||
      (obj as SpriteDataBase).solid === undefined) &&
    ((obj as SpriteDataBase).properties === undefined ||
      typeof (obj as SpriteDataBase).properties === 'object') &&
    ((obj as SpriteDataBase).colliders === undefined ||
      Array.isArray((obj as SpriteDataBase).colliders))
  )
}
