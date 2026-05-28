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
