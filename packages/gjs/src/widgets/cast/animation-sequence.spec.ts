import { describe, expect, it } from '@gjsify/unit'

import { insertAt, moveTo, removeAt } from './animation-sequence.ts'

export default async () => {
  await describe('animation-sequence', async () => {
    await describe('insertAt', async () => {
      await it('inserts at a middle gap', async () => {
        expect(insertAt(['a', 'b', 'c'], 1, 'x')).toStrictEqual(['a', 'x', 'b', 'c'])
      })
      await it('inserts at the head + tail gaps', async () => {
        expect(insertAt(['a', 'b'], 0, 'x')).toStrictEqual(['x', 'a', 'b'])
        expect(insertAt(['a', 'b'], 2, 'x')).toStrictEqual(['a', 'b', 'x'])
      })
      await it('clamps an over-range gap to the tail', async () => {
        expect(insertAt(['a'], 9, 'x')).toStrictEqual(['a', 'x'])
      })
      await it('does not mutate the input', async () => {
        const input = ['a', 'b']
        insertAt(input, 1, 'x')
        expect(input).toStrictEqual(['a', 'b'])
      })

      await it('seeds an empty sequence', async () => {
        expect(insertAt([], 0, 'x')).toStrictEqual(['x'])
        expect(insertAt([], 7, 'x')).toStrictEqual(['x'])
      })

      await it('clamps a negative gap to the head', async () => {
        expect(insertAt(['a', 'b'], -3, 'x')).toStrictEqual(['x', 'a', 'b'])
      })

      await it('inserts at the last gap, not one before it', async () => {
        // Off-by-one guard: gap `length` means "after the last frame".
        expect(insertAt(['a', 'b', 'c'], 3, 'x')).toStrictEqual(['a', 'b', 'c', 'x'])
      })
    })

    await describe('moveTo', async () => {
      await it('moves an item forward, accounting for the removal shift', async () => {
        // Move 'a' (index 0) to gap 2 → after the removal, insert at 1.
        expect(moveTo(['a', 'b', 'c'], 0, 2)).toStrictEqual(['b', 'a', 'c'])
      })
      await it('moves an item backward', async () => {
        expect(moveTo(['a', 'b', 'c'], 2, 0)).toStrictEqual(['c', 'a', 'b'])
      })
      await it('is a no-op dropping into either adjacent gap', async () => {
        expect(moveTo(['a', 'b', 'c'], 1, 1)).toStrictEqual(['a', 'b', 'c'])
        expect(moveTo(['a', 'b', 'c'], 1, 2)).toStrictEqual(['a', 'b', 'c'])
      })
      await it('moves to the very end', async () => {
        expect(moveTo(['a', 'b', 'c'], 0, 3)).toStrictEqual(['b', 'c', 'a'])
      })
      await it('returns a copy for an out-of-range source', async () => {
        const input = ['a', 'b']
        const out = moveTo(input, 5, 0)
        expect(out).toStrictEqual(['a', 'b'])
        expect(out).not.toBe(input)
      })

      await it('returns a copy for a negative source', async () => {
        expect(moveTo(['a', 'b'], -1, 1)).toStrictEqual(['a', 'b'])
      })

      await it('clamps an over-range destination to the tail', async () => {
        expect(moveTo(['a', 'b', 'c'], 0, 99)).toStrictEqual(['b', 'c', 'a'])
      })

      await it('clamps a negative destination to the head', async () => {
        expect(moveTo(['a', 'b', 'c'], 2, -5)).toStrictEqual(['c', 'a', 'b'])
      })

      await it('is a copy for a single-item sequence', async () => {
        expect(moveTo(['a'], 0, 1)).toStrictEqual(['a'])
        expect(moveTo(['a'], 0, 0)).toStrictEqual(['a'])
      })

      await it('handles an empty sequence', async () => {
        expect(moveTo([], 0, 0)).toStrictEqual([])
      })

      await it('moves the LAST item to the head', async () => {
        expect(moveTo(['a', 'b', 'c', 'd'], 3, 0)).toStrictEqual(['d', 'a', 'b', 'c'])
      })
    })

    await describe('removeAt', async () => {
      await it('removes the item at an index', async () => {
        expect(removeAt(['a', 'b', 'c'], 1)).toStrictEqual(['a', 'c'])
      })
      await it('returns a copy for an out-of-range index', async () => {
        const input = ['a', 'b']
        const out = removeAt(input, 9)
        expect(out).toStrictEqual(['a', 'b'])
        expect(out).not.toBe(input)
      })

      await it('removes the first and the last item', async () => {
        expect(removeAt(['a', 'b', 'c'], 0)).toStrictEqual(['b', 'c'])
        expect(removeAt(['a', 'b', 'c'], 2)).toStrictEqual(['a', 'b'])
      })

      await it('empties a single-item sequence', async () => {
        expect(removeAt(['a'], 0)).toStrictEqual([])
      })

      await it('ignores a negative index', async () => {
        expect(removeAt(['a', 'b'], -1)).toStrictEqual(['a', 'b'])
      })

      await it('ignores the index one past the end', async () => {
        expect(removeAt(['a', 'b'], 2)).toStrictEqual(['a', 'b'])
      })
    })
  })
}
