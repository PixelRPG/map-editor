/**
 * Maps can be organized into categories
 */
export interface MapCategory {
    /**
     * Unique identifier for this category
     */
    id: string;

    /**
     * Display name of the category
     */
    name: string;

    /**
     * Optional parent category ID for hierarchical organization
     */
    parentId?: string;
} 