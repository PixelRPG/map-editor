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

      await it('collapses a run of separators into one hyphen', async () => {
        expect(slugifySpriteSetName('Hero   Sheet__v2')).toBe('hero-sheet-v2')
      })

      await it('falls back for an empty name', async () => {
        expect(slugifySpriteSetName('')).toBe('sprite-set')
        expect(slugifySpriteSetName('   ')).toBe('sprite-set')
      })

      await it('keeps digits', async () => {
        expect(slugifySpriteSetName('Tileset 42')).toBe('tileset-42')
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

      await it('fits exactly at the boundary — no phantom extra column', async () => {
        expect(gridDimensions(64, 64, 64, 64)).toStrictEqual({ columns: 1, rows: 1 })
      })

      await it('reports the "doesn\'t fit" grid for a zero sprite size', async () => {
        // A zero divisor used to yield Infinity columns, which
        // `isUsableGrid` happily called usable.
        expect(gridDimensions(64, 64, 0, 16)).toStrictEqual({ columns: 0, rows: 0 })
        expect(gridDimensions(64, 64, 16, 0)).toStrictEqual({ columns: 0, rows: 0 })
      })

      await it('reports the "doesn\'t fit" grid for a negative sprite size', async () => {
        expect(gridDimensions(64, 64, -16, 16)).toStrictEqual({ columns: 0, rows: 0 })
      })

      await it('is empty for a zero-size image', async () => {
        expect(gridDimensions(0, 0, 16, 16)).toStrictEqual({ columns: 0, rows: 0 })
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

      await it('returns the origin for a grid with no cells instead of NaN', async () => {
        // Reachable the moment a caller forgets the `isUsableGrid` guard;
        // NaN coordinates reach the preview and paint nothing at all.
        expect(cellOrigin(0, { columns: 0, rows: 0 }, 16, 16)).toStrictEqual([0, 0])
        expect(cellOrigin(5, { columns: 4, rows: 0 }, 16, 16)).toStrictEqual([0, 0])
      })

      await it('puts cell 0 at the image origin', async () => {
        expect(cellOrigin(0, { columns: 4, rows: 3 }, 16, 24)).toStrictEqual([0, 0])
      })

      await it('wraps to the next row at the last column', async () => {
        expect(cellOrigin(3, { columns: 4, rows: 3 }, 16, 24)).toStrictEqual([48, 0])
        expect(cellOrigin(4, { columns: 4, rows: 3 }, 16, 24)).toStrictEqual([0, 24])
      })

      await it('lands on the LAST cell, not one past it', async () => {
        expect(cellOrigin(11, { columns: 4, rows: 3 }, 16, 24)).toStrictEqual([48, 48])
      })

      await it('clamps a negative index to the first cell', async () => {
        expect(cellOrigin(-4, { columns: 4, rows: 3 }, 16, 24)).toStrictEqual([0, 0])
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

      await it('clamps a negative value to zero', async () => {
        expect(colliderBound(-5, 32).value).toBe(0)
      })

      await it('keeps a value sitting exactly on the bound', async () => {
        expect(colliderBound(32, 32)).toStrictEqual({ value: 32, upper: 32 })
      })

      await it('never lets the upper bound collapse to zero', async () => {
        expect(colliderBound(0, 0)).toStrictEqual({ value: 0, upper: 1 })
      })
    })
  })
}
