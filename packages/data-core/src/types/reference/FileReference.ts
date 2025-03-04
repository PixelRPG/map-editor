/**
 * Represents a reference to an external file
 * Used for referencing external resources like sprite sets, images, etc.
 */
export interface FileReference {
    /**
     * The unique identifier for the referenced resource
     */
    id: string;

    /**
     * The path to the file, relative to the base path
     */
    path: string;

    /**
     * The type of the referenced file
     */
    type: 'spriteset' | 'tileset' | 'image' | 'audio' | 'data';

    /**
     * Optional version of the referenced file
     */
    version?: string;

    /**
     * Optional custom properties
     */
    properties?: Record<string, any>;
} 