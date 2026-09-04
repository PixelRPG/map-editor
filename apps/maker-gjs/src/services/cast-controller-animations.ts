import { type CharacterAnimation, REQUIRED_ROLES } from '@pixelrpg/engine'

/**
 * Sheet-owned animation list edits.
 *
 * Every one returns the NEXT list, or `null` when the edit is rejected
 * (duplicate id, empty frame list, protected role, missing target).
 * Pure so the collision rules — the part with real branching — are
 * exercisable without a project, a sprite-set, or GTK.
 *
 * Animations live on the sprite SHEET, shared by every character using
 * it, so a rejected edit must leave the list byte-identical: the
 * descriptor is persisted AND broadcast to peers on every write.
 */

/** Required roles are part of the character contract and can't be removed. */
export function isProtectedAnimation(animId: string): boolean {
  return (REQUIRED_ROLES as readonly string[]).includes(animId)
}

/** Append a new animation (dialog-validated; defensive re-check here). */
export function appendAnimation(
  anims: readonly CharacterAnimation[],
  animation: CharacterAnimation,
): CharacterAnimation[] | null {
  if (animation.frames.length === 0) return null
  if (anims.some((a) => a.id === animation.id)) return null
  return [...anims, animation]
}

/**
 * Replace `originalId`'s animation. A lost original is treated as an add
 * so the user's frames aren't dropped when the entry vanished meanwhile
 * (another session, a peer's delete); a rename onto an id that already
 * exists is rejected rather than silently merging two animations.
 */
export function replaceAnimation(
  anims: readonly CharacterAnimation[],
  originalId: string,
  animation: CharacterAnimation,
): CharacterAnimation[] | null {
  if (animation.frames.length === 0) return null
  const idx = anims.findIndex((a) => a.id === originalId)
  if (idx === -1) {
    if (anims.some((a) => a.id === animation.id)) return null
    return [...anims, animation]
  }
  if (animation.id !== originalId) {
    const collision = anims.findIndex((a) => a.id === animation.id)
    if (collision !== -1 && collision !== idx) return null
  }
  return anims.map((a, i) => (i === idx ? animation : a))
}

/** Drop an animation by id. */
export function removeAnimation(anims: readonly CharacterAnimation[], animId: string): CharacterAnimation[] | null {
  const idx = anims.findIndex((a) => a.id === animId)
  if (idx === -1) return null
  return anims.filter((_, i) => i !== idx)
}

/** Set one uniform per-frame duration across a single animation ("apply to all frames"). */
export function retimeAnimation(
  anims: readonly CharacterAnimation[],
  animId: string,
  durationMs: number,
): CharacterAnimation[] | null {
  const idx = anims.findIndex((a) => a.id === animId)
  if (idx === -1) return null
  const anim = anims[idx]
  const retimed: CharacterAnimation = { ...anim, frames: anim.frames.map((f) => ({ ...f, duration: durationMs })) }
  return anims.map((a, i) => (i === idx ? retimed : a))
}
