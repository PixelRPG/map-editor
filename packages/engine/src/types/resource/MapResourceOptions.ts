import type { SpriteSetResource } from '../../resource/SpriteSetResource';
import { ResourceOptions } from '../ResourceOptions';

export interface MapResourceOptions extends ResourceOptions {
    /**
     * Plugin will operate in headless mode and skip all graphics related
     * excalibur items including creating ImageSource's
     * Default false.
     */
    headless?: boolean;

    /**
     * Pre-loaded SpriteSetResources keyed by sprite-set ID.
     * When provided, MapResource reuses these instead of loading from disk.
     * Typically passed by GameProjectResource which preloads all project
     * sprite sets upfront.
     */
    preloadedSpriteSets?: Map<string, SpriteSetResource>;
}