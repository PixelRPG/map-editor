import { ColliderShape, Properties } from "./SpriteData";

/**
 * Represents a game object within an object layer
 * Used for non-tile entities like triggers, spawners, or custom game objects
 */
export interface ObjectData {
    /**
     * Unique identifier for the object
     */
    id: string;

    /**
     * Display name of the object
     */
    name: string;

    /**
     * Type of object:
     * - 'collider': Collision shape
     * - 'trigger': Trigger area
     * - 'spawn': Spawn point
     * - 'sprite': Visual sprite object that renders as a sprite
     * - 'custom': Custom game object
     */
    type: 'collider' | 'trigger' | 'spawn' | 'sprite' | 'custom';

    /**
     * X position in world coordinates (pixels)
     */
    x: number;

    /**
     * Y position in world coordinates (pixels)
     */
    y: number;

    /**
     * Width of the object in pixels
     */
    width: number;

    /**
     * Height of the object in pixels
     */
    height: number;

    /**
     * Whether the object is visible in the editor
     * Does not affect game behavior
     */
    visible?: boolean;

    /**
     * Optional rotation in degrees
     */
    rotation?: number;

    /**
     * Optional z-index for layering
     */
    zIndex?: number;

    /**
     * Optional scale factor
     */
    scale?: { x: number, y: number };

    /**
     * Custom properties for the object
     * Can be used to store object-specific configuration
     */
    properties?: Properties;

    /**
     * Optional collision shape configuration
     * Only used when type='collider' or 'trigger'
     */
    collider?: ColliderShape;

    /**
     * Sprite ID for rendering
     * Only used when type='sprite'
     */
    spriteId?: number;

    /**
     * Sprite set ID for rendering
     * Only used when type='sprite'
     */
    spriteSetId?: string;

    /**
     * Optional animation ID for animated sprites
     * Only used when type='sprite'
     */
    animationId?: string;

    /**
     * @deprecated Use spriteId instead
     */
    tileId?: number;

    /**
     * @deprecated Use spriteSetId instead
     */
    tileSetId?: string;
} 