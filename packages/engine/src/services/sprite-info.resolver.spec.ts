import { describe, expect, it } from '@gjsify/unit'

import type { MapResource } from '../resource/MapResource.ts'
import type { SpriteIndex } from '../types/SpriteIndex.ts'
import { findSpriteInfoForTileId, getSpriteGidSpan } from './sprite-info.resolver.ts'

function makeSpriteIndex(spriteIds: number[]): SpriteIndex {
  return {
    sprites: Object.fromEntries(spriteIds.map((id) => [id, {}])),
    data: {
      version: '1.0.0',
      id: 'set',
      name: 'set',
      spriteWidth: 16,
      spriteHeight: 16,
      columns: 1,
      rows: 1,
      sprites: spriteIds.map((id) => ({ id, col: 0, row: id })),
    },
  }
}

function makeMapResource(opts: {
  spriteSetResources: Map<string, SpriteIndex>
  spriteSetRefs: Array<{ id: string; firstGid: number }>
}): MapResource {
  return {
    getAllSpriteSetResources: () => opts.spriteSetResources,
    mapData: { spriteSets: opts.spriteSetRefs },
    // biome-ignore lint/suspicious/noExplicitAny: test stub mirrors only the methods exercised
  } as any
}

/**
 * Silence `console.warn` for the body of `fn`. @gjsify/unit has no
 * `vi.spyOn` equivalent, so the simpler shim here saves the original
 * reference + restores it in `finally`.
 */
async function muteWarn<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = console.warn
  console.warn = () => {}
  try {
    return await fn()
  } finally {
    console.warn = original
  }
}

export default async () => {
  await describe('findSpriteInfoForTileId', async () => {
    await it('returns null and warns for negative tile ids', async () => {
      const mapResource = makeMapResource({ spriteSetResources: new Map(), spriteSetRefs: [] })
      const result = await muteWarn(() => findSpriteInfoForTileId(mapResource, -1))
      expect(result).toBeNull()
    })

    await it('resolves a tile id to its local sprite within the matching set', async () => {
      const setA = makeSpriteIndex([0, 1, 2, 3])
      const setB = makeSpriteIndex([0, 1])
      const mapResource = makeMapResource({
        spriteSetResources: new Map([
          ['terrain', setA],
          ['objects', setB],
        ]),
        spriteSetRefs: [
          { id: 'terrain', firstGid: 1 },
          { id: 'objects', firstGid: 5 },
        ],
      })

      expect(findSpriteInfoForTileId(mapResource, 1)).toStrictEqual({ spriteSetId: 'terrain', spriteId: 0 })
      expect(findSpriteInfoForTileId(mapResource, 4)).toStrictEqual({ spriteSetId: 'terrain', spriteId: 3 })
      expect(findSpriteInfoForTileId(mapResource, 5)).toStrictEqual({ spriteSetId: 'objects', spriteId: 0 })
      expect(findSpriteInfoForTileId(mapResource, 6)).toStrictEqual({ spriteSetId: 'objects', spriteId: 1 })
    })

    await it('returns null when tile id falls outside every sprite set range', async () => {
      const set = makeSpriteIndex([0, 1])
      const mapResource = makeMapResource({
        spriteSetResources: new Map([['terrain', set]]),
        spriteSetRefs: [{ id: 'terrain', firstGid: 1 }],
      })
      const result = await muteWarn(() => findSpriteInfoForTileId(mapResource, 99))
      expect(result).toBeNull()
    })

    await it('skips sprite-set references without a numeric firstGid', async () => {
      const set = makeSpriteIndex([0, 1])
      const mapResource = makeMapResource({
        spriteSetResources: new Map([['terrain', set]]),
        spriteSetRefs: [{ id: 'terrain' } as { id: string; firstGid: number }],
      })
      const result = await muteWarn(() => findSpriteInfoForTileId(mapResource, 1))
      expect(result).toBeNull()
    })
  })

  await describe('getSpriteGidSpan', async () => {
    await it('returns maxLocalId + 1 (a span, not a count) for a sparse set', async () => {
      // Sparse ids: 5 sprites but the span reaches the largest id + 1.
      expect(getSpriteGidSpan(makeSpriteIndex([0, 1, 2, 7, 9]))).toBe(10)
      expect(getSpriteGidSpan(makeSpriteIndex([0, 1, 2, 3]))).toBe(4)
    })

    await it('returns 0 for an empty sprite set', async () => {
      expect(getSpriteGidSpan(makeSpriteIndex([]))).toBe(0)
    })
  })
}
