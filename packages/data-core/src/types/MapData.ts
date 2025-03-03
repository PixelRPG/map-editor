import { LayerData } from "./LayerData";
import { Properties } from "./SpriteData";
import { SpriteSetReference } from "./SpriteSetReference";

/**
 * Represents the core data structure for a tile-based map
 * Compatible with Excalibur.js TileMap format
 */
export interface MapData {
    /**
     * Unique identifier for the map
     */
    id?: string;

    /**
     * Optional name of the tile map
     */
    name?: string;

    /**
     * Array of sprite sets that are referenced in the map
     * Only references to external sprite set files are supported
     */
    spriteSets?: SpriteSetReference[];

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
    properties?: Properties;

    /**
     * Optional meshing lookbehind configuration
     * @see TileMapOptions.meshingLookBehind in Excalibur
     */
    meshingLookBehind?: number;

    /**
     * Optional editor-specific data
     */
    editorData?: {
        /**
         * Grid settings for the editor
         */
        grid?: {
            visible: boolean;
            color?: string;
            opacity?: number;
            size?: number;
        };

        /**
         * Camera settings for the editor
         */
        camera?: {
            x: number;
            y: number;
            zoom: number;
        };

        /**
         * Custom editor properties
         */
        properties?: Properties;
    };
}
