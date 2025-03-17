/**
 * Options for loading a game project
 */
export interface ProjectLoadOptions {
    /**
     * Whether to preload all sprite sets
     */
    preloadAllSpriteSets?: boolean;

    /**
     * Whether to preload all maps
     */
    preloadAllMaps?: boolean;

    /**
     * Initial map ID to load
     */
    initialMapId?: string;
} 