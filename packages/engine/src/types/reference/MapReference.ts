import { FileReference } from "./FileReference";

/**
 * Reference to a map file
 */
export interface MapReference extends FileReference {
    /**
     * Identifier for this map in the project
     */
    id: string;

    /**
     * Display name of the map
     */
    name?: string;

    /**
     * Optional map category for organization
     */
    category?: string;

    /**
     * The type is always 'map' for map references
     */
    type: 'map';
} 