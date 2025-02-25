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
     * - 'custom': Custom game object
     */
    type: 'collider' | 'trigger' | 'spawn' | 'custom';

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
     * Custom properties for the object
     * Can be used to store object-specific configuration
     */
    properties?: Record<string, any>;

    /**
     * Optional collision shape configuration
     * Only used when type='collider'
     */
    collider?: {
        /**
         * Type of collision shape
         */
        type: 'box' | 'circle' | 'polygon';

        /**
         * Shape-specific parameters
         */
        params?: Record<string, any>;
    };
} 