import { ResourceOptions } from '@pixelrpg/data-core';

/**
 * Options for the SpriteSetResource loader
 */
export interface SpriteSetResourceOptions extends ResourceOptions {
    /**
     * When true, only loads the data without loading images
     * Useful for server-side or headless environments
     */
    headless?: boolean;
}
