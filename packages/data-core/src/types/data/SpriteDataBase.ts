import type { ColliderShape, Properties } from "./index";

/**
 * Base interface for common sprite properties
 */
export interface SpriteDataBase {
    /**
     * Whether this sprite blocks movement/collisions when used as a tile
     */
    solid?: boolean;

    /**
     * Custom properties for the sprite
     */
    properties?: Properties;

    /**
     * Optional collision shapes for this sprite
     */
    colliders?: ColliderShape[];
}