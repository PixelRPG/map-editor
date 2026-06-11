import type { Graphic } from 'excalibur'
import type { MapResource } from '../resource/MapResource.ts'
import type { SpriteSetResource } from '../resource/SpriteSetResource.ts'
import type { ComponentData } from '../types/data/index.ts'
import { buildCharacterAnimation } from '../utils/character.ts'

/**
 * Build the Excalibur graphic for a `visual` component's data, resolving
 * the sprite/animation through the map's loaded sprite-set resources.
 * Returns `null` when the set is missing or nothing resolves (the caller
 * falls back to the outline marker).
 *
 * Resolution order for an `animationId` (e.g. a Cast character's
 * `idle-down` default):
 *
 * 1. the set's engine-level `animations` lookup (animated tiles /
 *    object graphics, built from `SpriteSetData.animations`),
 * 2. the sheet-owned `characterAnimations` (post-C5 home of the
 *    directional roles — what the Cast preview plays), built into a
 *    runtime animation on the fly,
 * 3. the static `spriteId` sprite, so a stale/unknown animation id
 *    still renders the appearance instead of the fallback marker.
 *
 * Without an `animationId` the static `spriteId` resolves directly.
 */
export function buildVisualGraphic(data: ComponentData, mapResource: MapResource): Graphic | null {
  const spriteSetId = data.spriteSetId
  if (typeof spriteSetId !== 'string') return null
  const spriteSet = mapResource.getSpriteSetResource(spriteSetId)
  if (!spriteSet) return null
  const animationId = typeof data.animationId === 'string' ? data.animationId : undefined
  const spriteId = typeof data.spriteId === 'number' ? data.spriteId : 0
  const graphic = animationId
    ? (spriteSet.animations[animationId]?.clone() ?? buildSheetCharacterAnimation(spriteSet, animationId))
    : undefined
  return graphic ?? spriteSet.sprites[spriteId]?.clone() ?? null
}

/**
 * Resolve an animation id against the sheet-owned `characterAnimations`
 * of a character sprite-set (disjoint from the engine-level `animations`
 * lookup — see `SpriteSetData`). Returns `null` when the sheet carries
 * no such animation or none of its frames resolve.
 */
function buildSheetCharacterAnimation(spriteSet: SpriteSetResource, animationId: string): Graphic | null {
  const anim = spriteSet.data?.characterAnimations?.find((a) => a.id === animationId)
  if (!anim) return null
  return buildCharacterAnimation(anim, spriteSet.sprites)
}
