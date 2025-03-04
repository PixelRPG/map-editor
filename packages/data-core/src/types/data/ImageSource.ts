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