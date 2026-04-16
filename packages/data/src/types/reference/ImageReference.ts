import { FileReference } from './FileReference';

/**
 * Represents a reference to an image file
 * Used for standalone images that aren't part of a sprite set
 */
export interface ImageReference extends FileReference {
    /**
     * The type is always 'image' for image references
     */
    type: 'image';
} 