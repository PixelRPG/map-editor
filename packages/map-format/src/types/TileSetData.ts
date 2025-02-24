import { TileDataTileSet } from "./TileData.js";

/**
 * Represents a tileset that can be used in a map
 * Compatible with Excalibur.js TileMap format
 */
export interface TileSetData {
    /**
     * Unique identifier for the tileset
     */
    id: string;

    /**
     * Display name of the tileset
     */
    name: string;

    /**
     * Path to the sprite sheet image
     */
    image: string;

    /**
     * Width of an individual tile in pixels
     */
    tileWidth: number;

    /**
     * Height of an individual tile in pixels
     */
    tileHeight: number;

    /**
     * Number of columns in the sprite sheet
     */
    columns: number;

    /**
     * Number of rows in the sprite sheet
     */
    rows: number;

    /**
     * Optional margin around tiles in pixels
     */
    margin?: number;

    /**
     * Optional spacing between tiles in pixels
     */
    spacing?: number;

    /**
     * Array of tile definitions in this tileset
     * Each tile references a specific position in the sprite sheet
     */
    tiles: TileDataTileSet[];

    /**
     * Optional custom properties
     */
    properties?: Record<string, any>;
}
