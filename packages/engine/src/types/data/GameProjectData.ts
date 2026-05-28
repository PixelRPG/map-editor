import type { GameStartupConfig } from '../GameStartupConfig'
import type { MapCategory } from '../MapCategory'
import type { MapReference, SpriteSetReference } from '../reference/index'
import type { CharacterDefinition, GameProjectEditorMetadata, ObjectDefinition, Properties } from './index'

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
   * Project-level cast — heroes and NPCs as reusable definitions.
   * Exactly one entry should carry `isPlayer: true` for `PlayerSystem`
   * to resolve. NPC placements reference a definition via
   * `NpcProperties.characterId` to inherit its sprite + animations.
   *
   * Optional — projects without configured characters fall back to a
   * procedural placeholder hero in playtest (see
   * `runtime/placeholder-character.ts`).
   */
  characters?: CharacterDefinition[]

  /**
   * Optional editor-specific data
   */
  editorData?: GameProjectEditorMetadata
}
