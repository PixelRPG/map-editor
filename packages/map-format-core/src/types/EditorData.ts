import { Properties } from "./SpriteData";

/**
 * Editor-specific metadata for game projects
 */
export interface GameProjectEditorData {
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