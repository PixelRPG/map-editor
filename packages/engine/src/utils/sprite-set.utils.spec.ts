import { describe, expect, it } from '@gjsify/unit'

import type { SpriteSetData } from '../types'
import { buildSpriteIdMap, iterateSpriteGrid, spriteSheetSpacingOf } from './sprite-set.utils.ts'

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

export default async () => {
  await describe('buildSpriteIdMap', async () => {
    await it('maps each sprite id to its grid position with correct row-major index', async () => {
      const map = buildSpriteIdMap(fakeSpriteSet())
      expect(map.get(0)).toStrictEqual({ col: 0, row: 0, index: 0 })
      expect(map.get(2)).toStrictEqual({ col: 2, row: 0, index: 2 })
      expect(map.get(3)).toStrictEqual({ col: 0, row: 1, index: 3 })
      expect(map.get(5)).toStrictEqual({ col: 2, row: 1, index: 5 })
    })

    await it('returns an empty map for a sprite set with no sprites', async () => {
      const map = buildSpriteIdMap(fakeSpriteSet({ sprites: [] }))
      expect(map.size).toBe(0)
    })

    await it('honors the data.columns value when computing index, not the sprite array length', async () => {
      const data = fakeSpriteSet({
        columns: 4,
        rows: 1,
        sprites: [{ id: 7, col: 3, row: 0 }],
      })
      expect(buildSpriteIdMap(data).get(7)).toStrictEqual({ col: 3, row: 0, index: 3 })
    })
  })

  await describe('iterateSpriteGrid', async () => {
    await it('yields columns × rows cells in row-major order', async () => {
      const cells = [...iterateSpriteGrid(fakeSpriteSet())]
      expect(cells).toHaveLength(6)
      expect(cells[0]).toStrictEqual({ col: 0, row: 0, index: 0, x: 0, y: 0, width: 16, height: 16 })
      expect(cells[3]).toStrictEqual({ col: 0, row: 1, index: 3, x: 0, y: 16, width: 16, height: 16 })
    })

    await it('uses spriteWidth/spriteHeight for pixel coordinates', async () => {
      const cells = [...iterateSpriteGrid(fakeSpriteSet({ spriteWidth: 32, spriteHeight: 24 }))]
      // @gjsify/unit has no toMatchObject — check individual fields
      expect(cells[2]?.x).toBe(64)
      expect(cells[2]?.y).toBe(0)
      expect(cells[2]?.width).toBe(32)
      expect(cells[2]?.height).toBe(24)
      expect(cells[5]?.x).toBe(64)
      expect(cells[5]?.y).toBe(24)
    })

    await it('steps over the gutter between cells', async () => {
      const cells = [...iterateSpriteGrid(fakeSpriteSet({ spacing: 1 }))]
      expect(cells[0]?.x).toBe(0)
      expect(cells[1]?.x).toBe(17)
      expect(cells[2]?.x).toBe(34)
      expect(cells[3]?.y).toBe(17)
      // The cell itself stays the tile size — the gutter is not part of it.
      expect(cells[1]?.width).toBe(16)
    })

    await it('offsets the whole grid by the margin', async () => {
      const cells = [...iterateSpriteGrid(fakeSpriteSet({ spacing: 1, margin: 2 }))]
      expect(cells[0]?.x).toBe(2)
      expect(cells[0]?.y).toBe(2)
      expect(cells[4]?.x).toBe(19)
      expect(cells[4]?.y).toBe(19)
    })
  })

  await describe('spriteSheetSpacingOf', async () => {
    await it('omits the descriptor for a tight grid', async () => {
      expect(spriteSheetSpacingOf(fakeSpriteSet())).toBe(undefined)
      expect(spriteSheetSpacingOf(fakeSpriteSet({ spacing: 0, margin: 0 }))).toBe(undefined)
    })

    await it("maps our spacing onto Excalibur's margin, not its originOffset", async () => {
      // The trap: both vocabularies have a `margin`, and they mean
      // different things. Ours is the border around the sheet (Excalibur
      // calls it `originOffset`); Excalibur's is the gutter between
      // sprites. Swapping them slices every sheet one pixel off.
      const spacing = spriteSheetSpacingOf(fakeSpriteSet({ spacing: 1, margin: 2 }))
      expect(spacing?.margin).toStrictEqual({ x: 1, y: 1 })
      expect(spacing?.originOffset).toStrictEqual({ x: 2, y: 2 })
    })

    await it('keeps a margin-only sheet instead of dropping it', async () => {
      const spacing = spriteSheetSpacingOf(fakeSpriteSet({ margin: 4 }))
      expect(spacing?.originOffset).toStrictEqual({ x: 4, y: 4 })
      expect(spacing?.margin).toStrictEqual({ x: 0, y: 0 })
    })
  })
}
