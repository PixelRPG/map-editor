import { Animation, AnimationStrategy, type Sprite } from 'excalibur'
import { buildPlaceholderAnimations } from '../runtime/placeholder-character.ts'
import type { SpriteSetResource } from '../resource/SpriteSetResource.ts'
import type {
  AnimationData,
  CharacterAnimation,
  CharacterAnimationRole,
  CharacterDefinition,
  GameProjectData,
} from '../types/data/index.ts'
import { REQUIRED_ROLES } from '../types/data/index.ts'

/**
 * Helpers around the {@link CharacterDefinition} schema and its
 * bridge to the engine's existing {@link AnimationData} (consumed by
 * `SpriteSetResource.createAnimations`).
 */

/**
 * Bridge a user-facing {@link CharacterAnimation} (uniform duration,
 * optional loop) into the engine's {@link AnimationData} shape (per-
 * frame duration array + strategy enum). The conversion is lossless
 * for what the Cast editor supports and lets us keep the existing
 * `SpriteSetResource.createAnimations` pipeline as-is.
 */
export function toAnimationData(anim: CharacterAnimation): AnimationData {
  return {
    id: anim.id,
    frames: anim.frames.map((spriteId) => ({ spriteId, duration: anim.durationMs })),
    strategy: (anim.loop ?? true) ? 'loop' : 'end',
  }
}

/**
 * Return the list of required animation roles a character is *missing*.
 * Empty array means "all 8 cardinal roles present" — the Cast view's
 * inspector chips paint green when this returns empty.
 */
export function missingRequiredRoles(character: CharacterDefinition): CharacterAnimationRole[] {
  const present = new Set(character.animations.map((a) => a.id))
  return REQUIRED_ROLES.filter((role) => !present.has(role))
}

/**
 * Locate the configured player character on a project. There should be
 * at most one — if multiple have `isPlayer: true`, the first wins.
 *
 * Returns `undefined` when no character is configured or none has
 * `isPlayer: true`; `PlayerSystem` then falls back to the procedural
 * placeholder.
 */
export function findPlayerCharacter(project: GameProjectData | null | undefined): CharacterDefinition | undefined {
  return project?.characters?.find((c) => c.isPlayer)
}

/**
 * Build a role → {@link AnimationData} map from a character. Only
 * entries whose `id` matches a {@link CharacterAnimationRole} are
 * included — custom animations (`sword-swing`, etc.) live in the
 * character's `animations` array but aren't part of the role map.
 *
 * The returned `AnimationData` can then be fed into the engine's
 * existing animation construction (e.g. via a `SpriteSetResource`-
 * compatible wrapper) to produce Excalibur `Animation`s.
 */
export function buildRoleAnimationData(
  character: CharacterDefinition,
): Partial<Record<CharacterAnimationRole, AnimationData>> {
  const out: Partial<Record<CharacterAnimationRole, AnimationData>> = {}
  for (const anim of character.animations) {
    if (REQUIRED_ROLES.includes(anim.id as CharacterAnimationRole)) {
      out[anim.id as CharacterAnimationRole] = toAnimationData(anim)
    }
  }
  return out
}

/**
 * Build a role → Excalibur {@link Animation} map for the player
 * actor. Walks the character's `animations` array, picks entries
 * whose id is a known {@link CharacterAnimationRole}, and resolves
 * each into a runtime `Animation` by cloning the matching sprites
 * out of the loaded {@link SpriteSetResource}.
 *
 * Missing required roles get filled in with the procedural
 * placeholder so the controller can always swap to *some* graphic
 * when the user transitions facing — better than freezing the
 * actor mid-walk if the cast editor hasn't filled in every role.
 *
 * Returns `null` when the sprite-set is `undefined` or carries no
 * sprites — callers fall back to the full placeholder set.
 */
export function buildCharacterAnimations(
  character: CharacterDefinition,
  spriteSet: SpriteSetResource | undefined,
): { animations: Partial<Record<CharacterAnimationRole, Animation>>; spriteWidth?: number; spriteHeight?: number } | null {
  if (!spriteSet) return null
  const animations: Partial<Record<CharacterAnimationRole, Animation>> = {}
  for (const anim of character.animations) {
    if (!REQUIRED_ROLES.includes(anim.id as CharacterAnimationRole)) continue
    const built = buildAnimation(anim, spriteSet.sprites)
    if (built) animations[anim.id as CharacterAnimationRole] = built
  }
  // Plug holes with the placeholder so role transitions never miss.
  const placeholder = buildPlaceholderAnimations()
  for (const role of REQUIRED_ROLES) {
    if (!animations[role]) animations[role] = placeholder[role]
  }
  return {
    animations,
    spriteWidth: spriteSet.data?.spriteWidth,
    spriteHeight: spriteSet.data?.spriteHeight,
  }
}

/** Build a single Excalibur {@link Animation} from a {@link CharacterAnimation}. */
function buildAnimation(
  anim: CharacterAnimation,
  sprites: Record<number, Sprite>,
): Animation | null {
  const frames = anim.frames
    .map((spriteId) => sprites[spriteId])
    .filter((s): s is Sprite => s != null)
    .map((sprite) => ({ graphic: sprite.clone(), duration: anim.durationMs }))
  if (frames.length === 0) return null
  return new Animation({
    frames,
    strategy: (anim.loop ?? true) ? AnimationStrategy.Loop : AnimationStrategy.End,
  })
}
