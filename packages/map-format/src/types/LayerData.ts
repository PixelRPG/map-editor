import type { TileDataMap } from "./TileData";
import type { ObjectData } from "./ObjectData";
/**
 * Represents a single layer within a tile map
 * Layers can contain either tiles or objects
 */
export interface LayerData {
    /**
     * Unique identifier for the layer
     */
    id: string;

    /**
     * Display name of the layer
     */
    name: string;

    /**
     * Type of layer:
     * - 'tile': Contains tile-based graphics and collisions
     * - 'object': Contains game objects, colliders, or other entities
     */
    type: 'tile' | 'object';

    /**
     * Whether the layer should be rendered
     */
    visible: boolean;

    /**
     * Array of tiles in this layer (only for type='tile')
     */
    tiles?: TileDataMap[];

    /**
     * Array of objects in this layer (only for type='object')
     */
    objects?: ObjectData[];
}