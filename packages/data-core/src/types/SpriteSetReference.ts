import { FileReference } from './FileReference';

/**
 * Represents a reference to a sprite set file
 * Used in MapData to reference external sprite set files
 */
export interface SpriteSetReference extends FileReference {
    /**
     * The type is always 'spriteset' for sprite set references
     */
    type: 'spriteset';

    /**
     * Optional first global ID for the sprite set
     * Used when multiple sprite sets are used in a map
     */
    firstGid?: number;
} 