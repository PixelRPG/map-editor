import { FileReference } from './FileReference.ts';

/**
 * Represents a reference to a tileset file
 * Used in MapData to reference external tileset files
 */
export interface TileSetReference extends FileReference {
    /**
     * The type is always 'tileset' for tileset references
     */
    type: 'tileset';

    /**
     * Optional first global ID for the tileset
     * Used when multiple tilesets are used in a map
     */
    firstGid?: number;
} 