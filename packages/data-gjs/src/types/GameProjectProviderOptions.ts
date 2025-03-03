/**
 * Options for the GameProjectProvider
 */
export interface GameProjectProviderOptions {
    /**
     * Whether to load all maps at startup
     * Default: false (load maps on demand)
     */
    preloadAllMaps?: boolean;

    /**
     * Whether to load all sprite sets at startup
     * Default: true (load all sprite sets immediately)
     */
    preloadAllSpriteSets?: boolean;

    /**
     * ID of the map to load initially
     * If not provided, will use the startup map from the project
     */
    initialMapId?: string;
} 