import { describe, expect, it } from '@gjsify/unit'

import {
  cellOrigin,
  colliderBound,
  gridDimensions,
  isUsableGrid,
  slugifySpriteSetName,
} from './sprite-set-import.model.ts'

export default async () => {
  await describe('sprite-set-import.model', async () => {
    await describe('slugifySpriteSetName', async () => {
      await it('lowercases and hyphenates', async () => {
        expect(slugifySpriteSetName('Hero Sheet!')).toBe('hero-sheet')
      })

      await it('trims leading and trailing separators', async () => {
        expect(slugifySpriteSetName('  --Forest--  ')).toBe('forest')
      })

      await it('falls back for a name with nothing usable in it', async () => {
        expect(slugifySpriteSetName('!!!')).toBe('sprite-set')
        expect(slugifySpriteSetName('')).toBe('sprite-set')
      })
    })

    await describe('gridDimensions', async () => {
      await it('divides the image into whole sprites', async () => {
        expect(gridDimensions(96, 80, 16, 16)).toStrictEqual({ columns: 6, rows: 5 })
      })

      await it('drops a partial trailing cell', async () => {
        expect(gridDimensions(100, 80, 16, 16)).toStrictEqual({ columns: 6, rows: 5 })
      })

      await it('reports a zero grid when the sprite is larger than the image', async () => {
        expect(isUsableGrid(gridDimensions(16, 16, 32, 32))).toBe(false)
      })
    })

    await describe('cellOrigin', async () => {
      const grid = { columns: 6, rows: 5 }

      await it('walks the grid row-major', async () => {
        expect(cellOrigin(0, grid, 16, 16)).toStrictEqual([0, 0])
        expect(cellOrigin(7, grid, 16, 16)).toStrictEqual([16, 16])
      })

      await it('clamps a selection past the last cell', async () => {
        expect(cellOrigin(999, grid, 16, 16)).toStrictEqual([80, 64])
      })
    })

    await describe('colliderBound', async () => {
      await it('keeps an in-range value', async () => {
        expect(colliderBound(4, 16)).toStrictEqual({ value: 4, upper: 16 })
      })

      await it('clamps a value left over from a larger cell', async () => {
        expect(colliderBound(30, 16)).toStrictEqual({ value: 16, upper: 16 })
      })

      await it('never lets the upper bound collapse to zero', async () => {
        expect(colliderBound(0, 0)).toStrictEqual({ value: 0, upper: 1 })
      })
    })
  })
}
