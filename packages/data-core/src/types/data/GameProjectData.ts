import type { Properties, GameProjectEditorMetadata } from "./index";
import type { MapReference, GameSpriteSetReference } from "../reference/index";
import type { GameStartupConfig } from "../GameStartupConfig";
import type { MapCategory } from "../MapCategory";

/**
 * Represents a complete game project containing maps and sprite sets
 */
export interface GameProjectData {
    /**
     * Format version for compatibility
     */
    version: string;

    /**
     * Unique identifier for the game project
     */
    id: string;

    /**
     * Display name of the game project
     */
    name: string;

    /**
     * Configuration for game startup
     */
    startup: GameStartupConfig;

    /**
     * Maps included in the project
     * Only references to external map files are supported
     */
    maps: MapReference[];

    /**
     * Optional map categories for organization
     */
    mapCategories?: MapCategory[];

    /**
     * Sprite sets included in the project
     * Only references to external sprite set files are supported
     */
    spriteSets: GameSpriteSetReference[];

    /**
     * Optional game-wide properties
     */
    properties?: Properties;

    /**
     * Optional editor-specific data
     */
    editorData?: GameProjectEditorMetadata;
} 