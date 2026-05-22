import type { SpriteDataBase, TileProperties } from './index'

/**
 * Represents a sprite definition in a sprite set
 */
export interface SpriteDataSet extends SpriteDataBase {
  /**
   * Unique identifier for this sprite within the sprite set
   */
  id: number

  /**
   * Column position in the sprite sheet
   */
  col: number

  /**
   * Row position in the sprite sheet
   */
  row: number

  /**
   * Optional name for the sprite
   */
  name?: string

  /**
   * Optional tags for categorization and filtering
   */
  tags?: string[]

  /**
   * Optional gameplay properties — walkable, surface, footstep
   * sound, encounter table. Consumed by the engine's
   * `WalkOnTileSystem` at runtime.
   *
   * Lives at the sprite-set level so the same tileset has identical
   * behaviour across projects. See `docs/concepts/object-system.md`.
   *
   * (Kept separate from the inherited `properties` bag because
   * `Properties` is `Record<string, PropertyValue>` — too narrow to
   * carry the nested `TileProperties` shape — and `properties`
   * already holds ad-hoc keys like `imageId` for sprite-sheet
   * dispatch.)
   */
  tileProperties?: TileProperties
}
