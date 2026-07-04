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
    })
  })
}
