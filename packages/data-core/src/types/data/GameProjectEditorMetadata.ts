import type { Properties } from "./index";

/**
 * Editor-specific metadata for game projects
 */
export interface GameProjectEditorMetadata {
    /**
     * Project author information
     */
    author?: string;

    /**
     * Project description
     */
    description?: string;

    /**
     * Project version
     */
    version?: string;

    /**
     * Last modified date
     */
    lastModified?: string;

    /**
     * Custom editor properties
     */
    properties?: Properties;
} 