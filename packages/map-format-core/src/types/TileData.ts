/**
 * Base interface for common tile properties
 */
interface TileDataBase {
    /**
     * Whether this tile blocks movement/collisions
     */
    solid?: boolean;

    /**
     * Custom properties for the tile
     */
    properties?: Record<string, any>;

    /**
     * Optional collision shapes for this tile
     */
    colliders?: {
        type: string;
        offset?: { x: number, y: number };
    }[];
}

/**
 * Represents a tile definition in a tileset
 */
export interface TileDataTileSet extends TileDataBase {
    /**
     * Unique identifier for this tile within the tileset
     */
    id: number;

    /**
     * Column position in the tileset sprite sheet
     */
    col: number;

    /**
     * Row position in the tileset sprite sheet
     */
    row: number;

    /**
     * Optional animation definition
     */
    animation?: {
        /**
         * Array of frame definitions
         */
        frames: {
            /**
             * The tile ID to display for this frame
             */
            tileId: number;
            /**
             * Duration of this frame in milliseconds
             */
            duration: number;
        }[];
        /**
         * Animation strategy
         * - 'end': Animation ends without displaying anything
         * - 'loop' (default): Animation loops to the first frame after the last frame
         * - 'pingpong': Animation plays to the last frame, then backwards to first frame
         * - 'freeze': Animation ends stopping on the last frame
         */
        strategy?: 'end' | 'loop' | 'pingpong' | 'freeze';
    };
}

/**
 * Represents a tile instance placed in a map
 */
export interface TileDataMap extends TileDataBase {
    /**
     * X coordinate of the tile in tile units (not pixels)
     */
    x: number;

    /**
     * Y coordinate of the tile in tile units (not pixels)
     */
    y: number;

    /**
     * Reference to tileset
     */
    tileSetId: string;

    /**
     * Reference to the tile definition in the tileset
     */
    tileId: number;
}