/**
 * Options for the SpriteSetResource loader
 */
export interface SpriteSetResourceOptions {
    /**
     * When true, only loads the data without loading images
     * Useful for server-side or headless environments
     */
    headless?: boolean;
}
