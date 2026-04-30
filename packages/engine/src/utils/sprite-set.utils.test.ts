import { describe, expect, it } from 'vitest'
import type { SpriteSetData } from '../types'
import { buildSpriteIdMap, iterateSpriteGrid } from './sprite-set.utils.ts'

const fakeSpriteSet = (overrides: Partial<SpriteSetData> = {}): SpriteSetData => ({
  version: '1.0.0',
  id: 'test-set',
  name: 'Test',
  spriteWidth: 16,
  spriteHeight: 16,
  columns: 3,
  rows: 2,
  sprites: [
    { id: 0, col: 0, row: 0 },
    { id: 1, col: 1, row: 0 },
    { id: 2, col: 2, row: 0 },
    { id: 3, col: 0, row: 1 },
    { id: 4, col: 1, row: 1 },
    { id: 5, col: 2, row: 1 },
  ],
  ...overrides,
})

describe('buildSpriteIdMap', () => {
  it('maps each sprite id to its grid position with correct row-major index', () => {
    const map = buildSpriteIdMap(fakeSpriteSet())
    expect(map.get(0)).toEqual({ col: 0, row: 0, index: 0 })
    expect(map.get(2)).toEqual({ col: 2, row: 0, index: 2 })
    expect(map.get(3)).toEqual({ col: 0, row: 1, index: 3 })
    expect(map.get(5)).toEqual({ col: 2, row: 1, index: 5 })
  })

  it('returns an empty map for a sprite set with no sprites', () => {
    const map = buildSpriteIdMap(fakeSpriteSet({ sprites: [] }))
    expect(map.size).toBe(0)
  })

  it('honors the data.columns value when computing index, not the sprite array length', () => {
    const data = fakeSpriteSet({
      columns: 4,
      rows: 1,
      sprites: [{ id: 7, col: 3, row: 0 }],
    })
    expect(buildSpriteIdMap(data).get(7)).toEqual({ col: 3, row: 0, index: 3 })
  })
})

describe('iterateSpriteGrid', () => {
  it('yields columns × rows cells in row-major order', () => {
    const cells = [...iterateSpriteGrid(fakeSpriteSet())]
    expect(cells).toHaveLength(6)
    expect(cells[0]).toEqual({ col: 0, row: 0, index: 0, x: 0, y: 0, width: 16, height: 16 })
    expect(cells[3]).toEqual({ col: 0, row: 1, index: 3, x: 0, y: 16, width: 16, height: 16 })
  })

  it('uses spriteWidth/spriteHeight for pixel coordinates', () => {
    const cells = [...iterateSpriteGrid(fakeSpriteSet({ spriteWidth: 32, spriteHeight: 24 }))]
    expect(cells[2]).toMatchObject({ x: 64, y: 0, width: 32, height: 24 })
    expect(cells[5]).toMatchObject({ x: 64, y: 24 })
  })
})
