import type { Graphic } from 'excalibur'
import type { MapResource } from '../resource/MapResource.ts'
import type { ComponentData } from '../types/data/index.ts'

/**
 * Build the Excalibur graphic for a `visual` component's data, resolving
 * the sprite/animation through the map's loaded sprite-set resources.
 * Returns `null` when the set/sprite is missing (the caller falls back to
 * the outline marker). Mirrors the shipped `attachSpriteGraphic`:
 * `animationId` takes precedence over the static `spriteId`.
 *
 * v1 handles the flat sprite-reference shape (`spriteSetId` + `spriteId` +
 * optional `animationId`). PR-4 extends this to the appearance-driven
 * `Visual` union (sheet `characterAnimations` → default animation) when
 * characters fold into the entity library.
 */
export function buildVisualGraphic(data: ComponentData, mapResource: MapResource): Graphic | null {
  const spriteSetId = data.spriteSetId
  if (typeof spriteSetId !== 'string') return null
  const spriteSet = mapResource.getSpriteSetResource(spriteSetId)
  if (!spriteSet) return null
  const animationId = typeof data.animationId === 'string' ? data.animationId : undefined
  const spriteId = typeof data.spriteId === 'number' ? data.spriteId : 0
  const graphic = animationId ? spriteSet.animations[animationId]?.clone() : spriteSet.sprites[spriteId]?.clone()
  return graphic ?? null
}
