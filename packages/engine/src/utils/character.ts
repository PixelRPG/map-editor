import { Animation, AnimationStrategy, type Sprite } from 'excalibur'
import { buildPlaceholderAnimations } from '../runtime/placeholder-character.ts'
import type { SpriteSetResource } from '../resource/SpriteSetResource.ts'
import type { CharacterAnimation, CharacterAnimationRole, CharacterDefinition } from '../types/data/index.ts'
import { REQUIRED_ROLES } from '../types/data/index.ts'

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
