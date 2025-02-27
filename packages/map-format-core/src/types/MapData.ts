import { LayerData } from "./LayerData.ts";
import { TileSetData } from "./TileSetData.ts";
import { TileSetReference } from "./TileSetReference.ts";

/**
 * Represents the core data structure for a tile-based map
 * Compatible with Excalibur.js TileMap format
 */
export interface MapData {
    /**
     * Optional name of the tile map
     */
    name?: string;

    /**
     * Array of tile sets that are referenced in the map
     * Can be either inline TileSetData objects or references to external files
     */
    tileSets: (TileSetData | TileSetReference)[];

    /**
     * Optional position of the tile map in world coordinates
     */
    pos?: { x: number, y: number };

    /**
     * Width of an individual tile in pixels
     */
    tileWidth: number;

    /**
     * Height of an individual tile in pixels
     */
    tileHeight: number;

    /**
     * The number of tile columns (width of the map in tiles)
     */
    columns: number;

    /**
     * The number of tile rows (height of the map in tiles)
     */
    rows: number;

    /**
     * When true, tiles are rendered from the top of their graphic
     * When false (default), tiles are rendered from the bottom
     */
    renderFromTopOfGraphic?: boolean;

    /**
     * Map format version identifier
     */
    version: string;

    /**
     * Array of layers that make up the map
     * Each layer's tiles will be converted to Excalibur Tiles
     * Multiple layers allow for:
     * - Visual layering (ground, objects, overhead)
     * - Collision layers
     * - Object/trigger layers
     */
    layers: LayerData[];

    /**
     * Optional custom properties for the map
     */
    properties?: Record<string, any>;

    /**
     * Optional meshing lookbehind configuration
     * @see TileMapOptions.meshingLookBehind in Excalibur
     */
    meshingLookBehind?: number;
}
