import type { GameStartupConfig } from '../GameStartupConfig'
import type { MapCategory } from '../MapCategory'
import type { MapReference, SpriteSetReference } from '../reference/index'
import type { CreditEntry, EntityDefinition, GameProjectEditorMetadata, ProjectLanguages, Properties } from './index'

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
   * Which optional {@link GameSystemSpec}s this project has switched on,
   * keyed by stable system id, plus their per-project settings.
   *
   * Absent — or an absent entry — means "base systems only": a project
   * written before a system existed opens with it off rather than
   * silently gaining it. `enabled: false` is DORMANT, not deleted: every
   * component that system owns stays in the file, stays editable and
   * stops running. An id this build does not know is reported at load
   * and the project still opens, so a template from a newer editor is
   * never a dead file.
   *
   * See `docs/concepts/game-systems.md`. Edits ride the
   * `__project/systems.set` op through the maker's `ProjectStore`.
   */
  gameSystems?: Record<string, { enabled: boolean; config?: Record<string, unknown> }>

  /**
   * Who made what the game is built from, shown in the editor and (later)
   * the in-game credits scene. Absent = empty list, so older projects open
   * unchanged. Validation rejects an unknown `role`, a duplicate `id` and a
   * `url` that is not http(s). Edits ride `__project/credits.set`.
   */
  credits?: CreditEntry[]

  /**
   * The languages the game's own text is written in (see
   * {@link LocalizedText}). Absent = `{ default: 'en', others: [] }`, so
   * older projects open unchanged. Edits ride `__project/languages.set`.
   */
  languages?: ProjectLanguages

  /**
   * Optional editor-specific data
   */
  editorData?: GameProjectEditorMetadata
}
