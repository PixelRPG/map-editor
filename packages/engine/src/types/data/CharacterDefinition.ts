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
 * Top-level "what is this character" definition. Lives at the project
 * level under {@link GameProjectData.characters}; map placements
 * reference it by id rather than embedding the data inline.
 *
 * Exactly one character per project carries `isPlayer: true`. The
 * {@link PlayerSystem} resolves it at runtime and uses its animation
 * map to drive the placeholder-or-real hero.
 *
 * Heroes and NPCs share the same shape, distinguished only by `kind`.
 * That keeps the Cast view's UX uniform — picking frames + setting
 * timings works the same for both.
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
