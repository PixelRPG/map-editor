import { FileReference } from "./FileReference";

/**
 * Reference to a sprite set file
 */
export interface GameSpriteSetReference extends FileReference {
    /**
     * Identifier for this sprite set in the project
     */
    id: string;

    /**
     * Display name of the sprite set
     */
    name?: string;

    /**
     * The type is always 'spriteset' for sprite set references
     */
    type: 'spriteset';

    /**
     * Optional sprite set category (characters, tiles, etc.)
     */
    category?: string;
} 