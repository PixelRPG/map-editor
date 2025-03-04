import { AnimationData, Properties, SpriteDataSet } from "./SpriteData";

/**
 * Image source definition for a sprite set
 */
export interface ImageSource {
    /**
     * Unique identifier for this image source
     */
    id: string;

    /**
     * Path to the sprite sheet image
     */
    path: string;

    /**
     * Width of an individual sprite in pixels
     */
    spriteWidth: number;

    /**
     * Height of an individual sprite in pixels
     */
    spriteHeight: number;

    /**
     * Number of columns in the sprite sheet
     */
    columns: number;

    /**
     * Number of rows in the sprite sheet
     */
    rows: number;

    /**
     * Optional margin around sprites in pixels
     */
    margin?: number;

    /**
     * Optional spacing between sprites in pixels
     */
    spacing?: number;
}

/**
 * Sprite group for organizing sprites
 */
export interface SpriteGroup {
    /**
     * Unique identifier for this group
     */
    id: string;

    /**
     * Display name of the group
     */
    name: string;

    /**
     * IDs of sprites in this group
     */
    spriteIds: number[];
}

/**
 * Sprite variant for alternative appearances
 */
export interface SpriteVariant {
    /**
     * Unique identifier for this variant
     */
    id: string;

    /**
     * Display name of the variant
     */
    name: string;

    /**
     * Mapping from original sprite ID to variant sprite ID
     */
    spriteOverrides: Record<number, number>;
}

/**
 * Editor-specific metadata
 */
export interface EditorData {
    /**
     * Categories for organization in the editor
     */
    categories?: string[];

    /**
     * Tags for filtering in the editor
     */
    tags?: string[];

    /**
     * ID of a sprite to use for preview
     */
    previewSpriteId?: number;

    /**
     * Description of the sprite set
     */
    description?: string;
}

/**
 * Represents a sprite set that can be used in a map
 * Compatible with Excalibur.js graphics system
 */
export interface SpriteSetData {
    /**
     * Format version for compatibility
     */
    version: string;

    /**
     * Unique identifier for the sprite set
     */
    id: string;

    /**
     * Display name of the sprite set
     */
    name: string;

    /**
     * Multiple image sources for the sprite set
     */
    images?: ImageSource[];

    /**
     * Array of sprite definitions in this sprite set
     * Each sprite references a specific position in a sprite sheet
     */
    sprites: SpriteDataSet[];

    /**
     * Array of animation definitions
     */
    animations?: AnimationData[];

    /**
     * Sprite groups for organization
     */
    groups?: SpriteGroup[];

    /**
     * Sprite variants for alternative appearances
     */
    variants?: SpriteVariant[];

    /**
     * Editor-specific metadata
     */
    editorData?: EditorData;

    /**
     * Optional custom properties
     */
    properties?: Properties;
} 