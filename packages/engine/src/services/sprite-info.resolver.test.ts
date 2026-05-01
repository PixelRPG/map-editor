import { describe, expect, it, vi } from 'vitest'
import type { MapResource } from '../resource/MapResource.ts'
import type { SpriteIndex } from '../types/SpriteIndex.ts'
import { findSpriteInfoForTileId } from './sprite-info.resolver.ts'

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

describe('findSpriteInfoForTileId', () => {
  it('returns null and warns for negative tile ids', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mapResource = makeMapResource({ spriteSetResources: new Map(), spriteSetRefs: [] })

    const result = findSpriteInfoForTileId(mapResource, -1)

    expect(result).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('resolves a tile id to its local sprite within the matching set', () => {
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

    expect(findSpriteInfoForTileId(mapResource, 1)).toEqual({ spriteSetId: 'terrain', spriteId: 0 })
    expect(findSpriteInfoForTileId(mapResource, 4)).toEqual({ spriteSetId: 'terrain', spriteId: 3 })
    expect(findSpriteInfoForTileId(mapResource, 5)).toEqual({ spriteSetId: 'objects', spriteId: 0 })
    expect(findSpriteInfoForTileId(mapResource, 6)).toEqual({ spriteSetId: 'objects', spriteId: 1 })
  })

  it('returns null when tile id falls outside every sprite set range', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const set = makeSpriteIndex([0, 1])
    const mapResource = makeMapResource({
      spriteSetResources: new Map([['terrain', set]]),
      spriteSetRefs: [{ id: 'terrain', firstGid: 1 }],
    })

    expect(findSpriteInfoForTileId(mapResource, 99)).toBeNull()
    warn.mockRestore()
  })

  it('skips sprite-set references without a numeric firstGid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const set = makeSpriteIndex([0, 1])
    const mapResource = makeMapResource({
      spriteSetResources: new Map([['terrain', set]]),
      spriteSetRefs: [{ id: 'terrain' } as { id: string; firstGid: number }],
    })

    expect(findSpriteInfoForTileId(mapResource, 1)).toBeNull()
    warn.mockRestore()
  })
})
