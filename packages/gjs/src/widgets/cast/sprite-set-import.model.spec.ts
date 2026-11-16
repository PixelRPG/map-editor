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
        expect(gridDimensions(96, 80, { spriteWidth: 16, spriteHeight: 16 })).toStrictEqual({ columns: 6, rows: 5 })
      })

      await it('drops a partial trailing cell', async () => {
        expect(gridDimensions(100, 80, { spriteWidth: 16, spriteHeight: 16 })).toStrictEqual({ columns: 6, rows: 5 })
      })

      await it('fits exactly at the boundary — no phantom extra column', async () => {
        expect(gridDimensions(64, 64, { spriteWidth: 64, spriteHeight: 64 })).toStrictEqual({ columns: 1, rows: 1 })
      })

      await it('reports the "doesn\'t fit" grid for a zero sprite size', async () => {
        // A zero divisor used to yield Infinity columns, which
        // `isUsableGrid` happily called usable.
        expect(gridDimensions(64, 64, { spriteWidth: 0, spriteHeight: 16 })).toStrictEqual({ columns: 0, rows: 0 })
        expect(gridDimensions(64, 64, { spriteWidth: 16, spriteHeight: 0 })).toStrictEqual({ columns: 0, rows: 0 })
      })

      await it('reports the "doesn\'t fit" grid for a negative sprite size', async () => {
        expect(gridDimensions(64, 64, { spriteWidth: -16, spriteHeight: 16 })).toStrictEqual({ columns: 0, rows: 0 })
      })

      await it('is empty for a zero-size image', async () => {
        expect(gridDimensions(0, 0, { spriteWidth: 16, spriteHeight: 16 })).toStrictEqual({ columns: 0, rows: 0 })
      })

      await it('reports a zero grid when the sprite is larger than the image', async () => {
        expect(isUsableGrid(gridDimensions(16, 16, { spriteWidth: 32, spriteHeight: 32 }))).toBe(false)
      })

      await it('counts the last cell, which has no gutter after it', async () => {
        // 3 cells of 16 px with 1 px between them need 50 px, not 51.
        expect(gridDimensions(50, 50, { spriteWidth: 16, spriteHeight: 16, spacing: 1 })).toStrictEqual({
          columns: 3,
          rows: 3,
        })
      })

      await it('slices the Kenney roguelike sheet as 57 × 31', async () => {
        // 968 × 526, 16 px tiles, 1 px spacing. Sliced as a tight grid
        // this reported 60 × 32 and sheared every row after the first.
        expect(gridDimensions(968, 526, { spriteWidth: 16, spriteHeight: 16, spacing: 1 })).toStrictEqual({
          columns: 57,
          rows: 31,
        })
      })

      await it('subtracts the margin on both sides', async () => {
        expect(gridDimensions(70, 70, { spriteWidth: 16, spriteHeight: 16, spacing: 1, margin: 2 })).toStrictEqual({
          columns: 3,
          rows: 3,
        })
      })
    })

    await describe('cellOrigin', async () => {
      const grid = { columns: 6, rows: 5 }

      await it('walks the grid row-major', async () => {
        expect(cellOrigin(0, grid, { spriteWidth: 16, spriteHeight: 16 })).toStrictEqual([0, 0])
        expect(cellOrigin(7, grid, { spriteWidth: 16, spriteHeight: 16 })).toStrictEqual([16, 16])
      })

      await it('returns the origin for a grid with no cells instead of NaN', async () => {
        // Reachable the moment a caller forgets the `isUsableGrid` guard;
        // NaN coordinates reach the preview and paint nothing at all.
        expect(cellOrigin(0, { columns: 0, rows: 0 }, { spriteWidth: 16, spriteHeight: 16 })).toStrictEqual([0, 0])
        expect(cellOrigin(5, { columns: 4, rows: 0 }, { spriteWidth: 16, spriteHeight: 16 })).toStrictEqual([0, 0])
      })

      await it('puts cell 0 at the image origin', async () => {
        expect(cellOrigin(0, { columns: 4, rows: 3 }, { spriteWidth: 16, spriteHeight: 24 })).toStrictEqual([0, 0])
      })

      await it('wraps to the next row at the last column', async () => {
        expect(cellOrigin(3, { columns: 4, rows: 3 }, { spriteWidth: 16, spriteHeight: 24 })).toStrictEqual([48, 0])
        expect(cellOrigin(4, { columns: 4, rows: 3 }, { spriteWidth: 16, spriteHeight: 24 })).toStrictEqual([0, 24])
      })

      await it('lands on the LAST cell, not one past it', async () => {
        expect(cellOrigin(11, { columns: 4, rows: 3 }, { spriteWidth: 16, spriteHeight: 24 })).toStrictEqual([48, 48])
      })

      await it('clamps a negative index to the first cell', async () => {
        expect(cellOrigin(-4, { columns: 4, rows: 3 }, { spriteWidth: 16, spriteHeight: 24 })).toStrictEqual([0, 0])
      })

      await it('clamps a selection past the last cell', async () => {
        expect(cellOrigin(999, grid, { spriteWidth: 16, spriteHeight: 16 })).toStrictEqual([80, 64])
      })

      await it('steps by tile + spacing, offset by the margin', async () => {
        const slicing = { spriteWidth: 16, spriteHeight: 16, spacing: 1, margin: 2 }
        expect(cellOrigin(0, grid, slicing)).toStrictEqual([2, 2])
        expect(cellOrigin(1, grid, slicing)).toStrictEqual([19, 2])
        expect(cellOrigin(6, grid, slicing)).toStrictEqual([2, 19])
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
