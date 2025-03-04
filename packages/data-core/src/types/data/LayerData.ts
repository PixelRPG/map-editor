import type { Properties, SpriteDataMap, ObjectData } from "./index";

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
     * Optional opacity value (0-1)
     */
    opacity?: number;

    /**
     * Optional z-index for layer ordering
     */
    zIndex?: number;

    /**
     * Array of sprites in this layer (only for type='tile')
     */
    sprites?: SpriteDataMap[];

    /**
     * Array of objects in this layer (only for type='object')
     */
    objects?: ObjectData[];

    /**
     * Optional custom properties for the layer
     */
    properties?: Properties;
}