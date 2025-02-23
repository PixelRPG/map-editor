/**
 * Represents a single tile within a tile layer
 * Compatible with Excalibur.js Tile system
 */
export interface TileData {
    /**
     * X coordinate of the tile in tile units (not pixels)
     */
    x: number;

    /**
     * Y coordinate of the tile in tile units (not pixels)
     */
    y: number;

    /**
     * Whether this tile blocks movement/collisions
     * Used by Excalibur's built-in collision system
     */
    solid?: boolean;

    /**
     * Array of graphic/sprite references to be rendered for this tile
     * Multiple graphics will be rendered in array order
     */
    graphics?: string[];

    /**
     * Custom properties for the tile
     * Can be used to store gameplay-specific data
     */
    properties?: Record<string, any>;

    /**
     * Optional collision shapes for this tile
     * Allows for more complex collision than the default solid rectangle
     */
    colliders?: {
        /**
         * Type of collider shape
         */
        type: string;

        /**
         * Optional offset from tile position
         */
        offset?: { x: number, y: number };
    }[];
}