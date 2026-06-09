import type { CharacterAnimationRole } from './CharacterAnimationRole'

/**
 * A single animation belonging to a {@link CharacterDefinition}.
 *
 * `id` doubles as the role name for required animations (matches a
 * {@link CharacterAnimationRole}); for custom animations (`sword-swing`,
 * `wave`, …) it can be any user-chosen string. One-field-per-thing —
 * no separate `role` slot, no enum-and-id duplication.
 *
 * Frames are sprite indices into the character's `spriteSetId`. The
 * frame duration is uniform across the animation (the user spec —
 * "die geschwindigkeit soll in ms eingestellt werden können, wobei
 * sie alle pro animation gleich sind"). Loop defaults to `true`.
 */
export interface CharacterAnimation {
  id: string
  frames: number[]
  durationMs: number
  loop?: boolean
}

/**
 * A character **view model** — the friendly, flat shape the Cast UI and
 * `PlayerSystem` consume. **Not project-persisted:** a character lives in
 * `GameProjectData.entityLibrary` as an `EntityDefinition` (tagged
 * `editorData.template === 'character'`, with `visual` + `movement`
 * components); the maker / engine map that entity ↔ this view model via
 * `entityToCharacter` / `characterToEntity` (`entity/convert.ts`).
 *
 * Keeping a flat view model is the concept's progressive-disclosure rule:
 * the Cast surface stays simple while the persisted data is the unified
 * entity model. See `docs/concepts/entity-and-appearance-model.md`.
 *
 * `isPlayer` is derived from `GameProjectData.playerActorId` when the
 * view model is built; `kind` is editor-cosmetic.
 */
export interface CharacterDefinition {
  /** Stable, project-unique id. */
  id: string
  /** Display name in the Cast view + inspector. */
  name: string
  /** Hero (playable) vs NPC (placed by the user on maps). */
  kind: 'hero' | 'npc'
  /** Exactly one character per project should have this true. */
  isPlayer?: boolean
  /** Source sprite-set the frames are indexed into. */
  spriteSetId: string
  /**
   * @deprecated Animations now live on the sprite sheet
   * ({@link SpriteSetData.characterAnimations}) so characters sharing a
   * sheet share them. Optional only for back-compat: the engine falls
   * back to this when the referenced sheet carries no animations.
   */
  animations?: CharacterAnimation[]
  /** Default animation when the character is first instantiated. Falls back to `idle-down`. */
  defaultAnimation?: string
  /** Movement speed (tiles per second) when controlled by PlayerSystem. Default 4. */
  speedTilesPerSec?: number
}
