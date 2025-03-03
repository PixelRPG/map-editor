/**
 * Options for the GameProjectResource
 */
export interface GameProjectResourceOptions {
    /**
     * Whether to run in headless mode (no graphics)
     */
    headless?: boolean;

    /**
     * Base path override for resolving relative paths
     */
    basePath?: string;

    /**
     * Whether to load all maps immediately (default: false)
     * If false, only the initial map is loaded immediately
     */
    preloadAllMaps?: boolean;

    /**
     * Whether to load all sprite sets immediately (default: true)
     */
    preloadAllSpriteSets?: boolean;

    /**
     * Custom initial map ID override
     * If provided, overrides the initialMapId from the project data
     */
    initialMapId?: string;
} 