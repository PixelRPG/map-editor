import type { GameStartupConfig } from '../GameStartupConfig'
import type { MapCategory } from '../MapCategory'
import type { MapReference, SpriteSetReference } from '../reference/index'
import type { GameProjectEditorMetadata, ObjectDefinition, Properties } from './index'

/**
 * Represents a complete game project containing maps and sprite sets
 */
export interface GameProjectData {
  /**
   * Format version for compatibility
   */
  version: string

  /**
   * Unique identifier for the game project
   */
  id: string

  /**
   * Display name of the game project
   */
  name: string

  /**
   * Configuration for game startup
   */
  startup: GameStartupConfig

  /**
   * Maps included in the project
   * Only references to external map files are supported
   */
  maps: MapReference[]

  /**
   * Optional map categories for organization
   */
  mapCategories?: MapCategory[]

  /**
   * Sprite sets included in the project
   * Only references to external sprite set files are supported
   */
  spriteSets: SpriteSetReference[]

  /**
   * Optional game-wide properties
   */
  properties?: Properties

  /**
   * Projectwide library of reusable object definitions — NPCs, items,
   * teleports, spawn points, custom entities. Map-level
   * `objectPlacements[]` reference these via `defId`.
   *
   * See `docs/concepts/object-system.md` for the Definition/Placement
   * model and the canonical pattern table.
   */
  objectLibrary?: ObjectDefinition[]

  /**
   * Optional editor-specific data
   */
  editorData?: GameProjectEditorMetadata
}
