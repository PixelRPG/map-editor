import Gio from '@girs/gio-2.0';
import { ResourceOptions } from './ResourceOptions';

/**
 * Options for loading a game project resource in GJS
 */
export interface GameProjectResourceOptions extends ResourceOptions {
    /**
     * Whether to load all referenced resources immediately
     */
    preloadResources?: boolean;


} 