/**
 * Common options interfaces for resources across different platforms
 */

/**
 * Base options interface for all resources
 */
export interface ResourceOptions {
    /**
     * Optional base path for resolving relative paths
     */
    basePath?: string;
}

/**
 * Options for map resources
 */
export interface MapResourceOptions extends ResourceOptions {
    /**
     * Whether to operate in headless mode (no UI components)
     * Used primarily in Excalibur implementation
     */
    headless?: boolean;
}

/**
 * Options for sprite set resources
 */
export interface SpriteSetResourceOptions extends ResourceOptions {
    /**
     * Whether to operate in headless mode (no UI components)
     * Used primarily in Excalibur implementation
     */
    headless?: boolean;
}

/**
 * Options for game project resources
 */
export interface GameProjectResourceOptions extends ResourceOptions {
    /**
     * Whether to preload all maps when loading the project
     */
    preloadAllMaps?: boolean;

    /**
     * Whether to preload all sprite sets when loading the project
     */
    preloadAllSpriteSets?: boolean;

    /**
     * ID of the initial map to load
     */
    initialMapId?: string;

    /**
     * Whether to operate in headless mode (no UI components)
     * Used primarily in Excalibur implementation
     */
    headless?: boolean;
} 