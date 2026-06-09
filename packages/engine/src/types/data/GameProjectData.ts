import type { GameStartupConfig } from '../GameStartupConfig'
import type { MapCategory } from '../MapCategory'
import type { MapReference, SpriteSetReference } from '../reference/index'
import type { EntityDefinition, GameProjectEditorMetadata, Properties } from './index'

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
   * Projectwide library of reusable {@link EntityDefinition}s — NPCs,
   * items, teleports, spawn points, characters, custom entities, each an
   * explicit list of components. Map-level `objectPlacements[]` reference
   * these via `defId`.
   *
   * See `docs/concepts/entity-and-appearance-model.md`.
   */
  entityLibrary?: EntityDefinition[]

  /**
   * Id of the {@link EntityDefinition} in {@link entityLibrary} that is
   * the player. `PlayerSystem` resolves it (via the maker's view-model
   * mapping) and spawns it at the map's player spawn-point. The cast
   * "is this the player?" toggle writes this single field — the one-of-N
   * player invariant is structural, not enforced.
   *
   * Optional — a project without one falls back to a procedural
   * placeholder hero in playtest. Characters themselves are
   * `entityLibrary` entries tagged `editorData.template === 'character'`.
   */
  playerActorId?: string

  /**
   * Optional editor-specific data
   */
  editorData?: GameProjectEditorMetadata
}
