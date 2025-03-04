import type { SpriteDataBase } from "./index";

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