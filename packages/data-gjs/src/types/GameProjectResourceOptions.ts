import GLib from '@girs/glib-2.0';
import Gio from '@girs/gio-2.0';

/**
 * Options for loading a game project resource in GJS
 */
export interface GameProjectResourceOptions {
    /**
     * Path to the game project file
     */
    path: string;

    /**
     * Base directory for resolving relative paths
     */
    baseDir?: string | Gio.File;

    /**
     * Whether to load all referenced resources immediately
     */
    preloadResources?: boolean;

    /**
     * Whether to use GResource for loading assets
     */
    useGResource?: boolean;

    /**
     * Optional GResource path prefix
     */
    resourcePrefix?: string;
} 