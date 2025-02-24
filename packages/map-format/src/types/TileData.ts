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