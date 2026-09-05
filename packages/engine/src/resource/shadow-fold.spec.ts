/**
 * Folding the live editor shadow back into per-layer sprite arrays.
 *
 * The deterministic ordering is the load-bearing part: this output goes
 * both to disk and onto the wire, so an unstable sort would show up as
 * spurious file diffs and as snapshot bytes that differ between two
 * hosts holding identical maps.
 */

import { describe, expect, it } from '@gjsify/unit'

import { foldShadowToLayerSprites, type ShadowSprites } from './shadow-fold.ts'

const ground: ShadowSprites = {
  '1,0': [{ spriteSetId: 'tiles', spriteId: 5, layerId: 'ground' }],
  '0,0': [{ spriteSetId: 'tiles', spriteId: 4, layerId: 'ground' }],
  '0,1': [{ spriteSetId: 'tiles', spriteId: 6, layerId: 'ground' }],
}

export default async () => {
  await describe('foldShadowToLayerSprites', async () => {
    await it('groups refs by their layer id', async () => {
      const shadow: ShadowSprites = {
        '0,0': [
          { spriteSetId: 'tiles', spriteId: 1, layerId: 'ground' },
          { spriteSetId: 'tiles', spriteId: 2, layerId: 'decor' },
        ],
      }
      const result = foldShadowToLayerSprites([shadow])
      expect([...result.keys()].sort()).toStrictEqual(['decor', 'ground'])
      expect(result.get('decor')).toStrictEqual([{ x: 0, y: 0, spriteSetId: 'tiles', spriteId: 2 }])
    })

    await it('sorts by row, then column', async () => {
      const result = foldShadowToLayerSprites([ground])
      expect(result.get('ground')?.map((s) => [s.x, s.y])).toStrictEqual([
        [0, 0],
        [1, 0],
        [0, 1],
      ])
    })

    await it('writes no depth per sprite — two sprites of one layer on one cell keep insertion order', async () => {
      // The per-sprite `zIndex` that used to break this tie is gone; the
      // only order that matters is between LAYERS, and it is not stored
      // per sprite at all (see `services/layer-order.ts`).
      const stacked: ShadowSprites = {
        '2,2': [
          { spriteSetId: 'tiles', spriteId: 9, layerId: 'ground' },
          { spriteSetId: 'tiles', spriteId: 8, layerId: 'ground' },
        ],
      }
      const sprites = foldShadowToLayerSprites([stacked]).get('ground') ?? []
      expect(sprites.map((s) => s.spriteId)).toStrictEqual([9, 8])
      expect(sprites.every((s) => !('zIndex' in s))).toBe(true)
    })

    await it('merges the shadows of every plane into one per-layer view', async () => {
      const background: ShadowSprites = { '0,0': [{ spriteSetId: 'tiles', spriteId: 1, layerId: 'sky' }] }
      const foreground: ShadowSprites = { '0,0': [{ spriteSetId: 'tiles', spriteId: 2, layerId: 'roofs' }] }
      const result = foldShadowToLayerSprites([background, foreground])
      expect([...result.keys()].sort()).toStrictEqual(['roofs', 'sky'])
    })

    await it('omits optional fields rather than writing undefined into the JSON', async () => {
      const shadow: ShadowSprites = { '0,0': [{ spriteSetId: 'tiles', spriteId: 1, layerId: 'ground' }] }
      const entry = foldShadowToLayerSprites([shadow]).get('ground')?.[0]
      expect(Object.keys(entry ?? {}).sort()).toStrictEqual(['spriteId', 'spriteSetId', 'x', 'y'])
    })

    await it('carries animationId through when present', async () => {
      const shadow: ShadowSprites = {
        '3,4': [{ spriteSetId: 'tiles', spriteId: 7, layerId: 'ground', animationId: 'torch' }],
      }
      expect(foldShadowToLayerSprites([shadow]).get('ground')).toStrictEqual([
        { x: 3, y: 4, spriteSetId: 'tiles', spriteId: 7, animationId: 'torch' },
      ])
    })

    await it('returns an empty map for an empty shadow', async () => {
      expect(foldShadowToLayerSprites([]).size).toBe(0)
      expect(foldShadowToLayerSprites([{}]).size).toBe(0)
    })
  })
}
