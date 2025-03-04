/**
 * Editor-specific metadata
 */
export interface EditorMetadata {
    /**
     * Categories for organization in the editor
     */
    categories?: string[];

    /**
     * Tags for filtering in the editor
     */
    tags?: string[];

    /**
     * ID of a sprite to use for preview
     */
    previewSpriteId?: number;

    /**
     * Description of the sprite set
     */
    description?: string;
}