/**
 * Type for property values with improved type safety
 */
export type PropertyValue = string | number | boolean | null;

/**
 * Type for property collections
 */
export type Properties = Record<string, PropertyValue>;

/**
 * Collider shape definitions with improved type safety
 */
export type ColliderShape =
    | { type: 'rectangle', width: number, height: number, offset?: { x: number, y: number } }
    | { type: 'circle', radius: number, offset?: { x: number, y: number } }
    | { type: 'polygon', points: { x: number, y: number }[] };

/**
 * Base interface for common sprite properties
 */
interface SpriteDataBase {
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

/**
 * Represents a sprite definition in a sprite set
 */
export interface SpriteDataSet extends SpriteDataBase {
    /**
     * Unique identifier for this sprite within the sprite set
     */
    id: number;

    /**
     * Column position in the sprite sheet
     */
    col: number;

    /**
     * Row position in the sprite sheet
     */
    row: number;

    /**
     * Optional name for the sprite
     */
    name?: string;

    /**
     * Optional tags for categorization and filtering
     */
    tags?: string[];
}

/**
 * Animation frame definition
 */
export interface AnimationFrame {
    /**
     * The sprite ID to display for this frame
     */
    spriteId: number;

    /**
     * Duration of this frame in milliseconds
     */
    duration: number;
}

/**
 * Animation strategy types
 */
export type AnimationStrategy = 'end' | 'loop' | 'pingpong' | 'freeze';

/**
 * Animation definition
 */
export interface AnimationData {
    /**
     * Unique identifier for this animation
     */
    id: string;

    /**
     * Optional name for the animation
     */
    name?: string;

    /**
     * Array of frame definitions
     */
    frames: AnimationFrame[];

    /**
     * Animation strategy
     * - 'end': Animation ends without displaying anything
     * - 'loop' (default): Animation loops to the first frame after the last frame
     * - 'pingpong': Animation plays to the last frame, then backwards to first frame
     * - 'freeze': Animation ends stopping on the last frame
     */
    strategy: AnimationStrategy;
}

/**
 * Represents a sprite instance placed in a map
 */
export interface SpriteDataMap extends SpriteDataBase {
    /**
     * X coordinate in tile units (not pixels)
     */
    x: number;

    /**
     * Y coordinate in tile units (not pixels)
     */
    y: number;

    /**
     * Reference to sprite set
     */
    spriteSetId: string;

    /**
     * Reference to the sprite definition in the sprite set
     */
    spriteId: number;

    /**
     * Optional reference to an animation
     */
    animationId?: string;

    /**
     * Optional z-index for layering
     */
    zIndex?: number;
} 