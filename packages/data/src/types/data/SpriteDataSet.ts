import type { SpriteDataBase } from "./index";

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