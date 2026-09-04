import { describe, expect, it } from '@gjsify/unit'

import type { EntityDefinition } from '@pixelrpg/engine'
import { canBeCastMember, iconOf, visualOf } from './entity-visuals.ts'

const def = (components: EntityDefinition['components']): EntityDefinition => ({
  id: 'e1',
  name: 'Entity',
  components,
})

export default async () => {
  await describe('visualOf', async () => {
    await it('reads the visual component’s sprite reference', async () => {
      expect(visualOf(def([{ type: 'visual', spriteSetId: 'terrain', spriteId: 7 }]))).toStrictEqual({
        spriteSetId: 'terrain',
        spriteId: 7,
      })
    })

    await it('defaults a missing sprite index to 0', async () => {
      expect(visualOf(def([{ type: 'visual', spriteSetId: 'terrain' }]))).toStrictEqual({
        spriteSetId: 'terrain',
        spriteId: 0,
      })
    })

    await it('returns null without a usable visual component', async () => {
      expect(visualOf(null)).toBe(null)
      expect(visualOf(def([]))).toBe(null)
      expect(visualOf(def([{ type: 'visual', spriteId: 3 }]))).toBe(null)
    })
  })

  await describe('iconOf', async () => {
    await it('lets the higher-priority component win', async () => {
      const teleportFirst = iconOf(def([{ type: 'trigger' }, { type: 'teleport' }]))
      const teleportOnly = iconOf(def([{ type: 'teleport' }]))
      expect(teleportFirst).toBe(teleportOnly)
      expect(teleportFirst).not.toBe(iconOf(def([{ type: 'trigger' }])))
    })

    await it('is undefined without a definition or a known component', async () => {
      expect(iconOf(null)).toBe(undefined)
      expect(iconOf(def([{ type: 'visual' }]))).toBe(undefined)
    })
  })

  await describe('canBeCastMember', async () => {
    await it('needs a visual that names a real appearance', async () => {
      expect(canBeCastMember(def([{ type: 'visual', spriteSetId: 'hero' }]))).toBe(true)
    })

    await it('rejects an appearance-less or visual-less entity', async () => {
      expect(canBeCastMember(def([{ type: 'visual', spriteSetId: '' }]))).toBe(false)
      expect(canBeCastMember(def([{ type: 'visual' }]))).toBe(false)
      expect(canBeCastMember(def([{ type: 'teleport' }]))).toBe(false)
    })
  })
}
