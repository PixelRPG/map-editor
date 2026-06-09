import { SpriteRefComponent } from '../../components/index.ts'
import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/**
 * Visual — the entity's look. v1 carries a flat sprite reference
 * (spriteSetId + spriteId + optional animationId), matching the shipped
 * `SpriteRef`. PR-3 generalises this to a `Visual = sprite | appearance`
 * union once the appearance-graphic builder lands; until then it builds a
 * `SpriteRefComponent` and the spawn pipeline attaches the graphic.
 */
interface VisualData extends ComponentData {
  type: 'visual'
  spriteSetId: string
  spriteId: number
  animationId?: string
}

export const visualSpec: ComponentSpec = {
  type: 'visual',
  editor: { label: 'Appearance', icon: 'image-x-generic-symbolic', basic: true },
  fields: [
    { key: 'spriteSetId', label: 'Appearance', input: 'appearance-ref', required: true, basic: true },
    { key: 'spriteId', label: 'Sprite index', input: 'int', basic: true, default: 0, min: 0 },
    { key: 'animationId', label: 'Animation', input: 'text' },
  ],
  build: (data) => {
    const d = data as VisualData
    return new SpriteRefComponent(d.spriteSetId, d.spriteId ?? 0, d.animationId)
  },
}
