import { describe, expect, it } from '@gjsify/unit'

import { cellMenuActions, cellState, cellTapIntent, GRID_MIN_WIDTH, gridFits } from './animation-cell.model.ts'

export default async () => {
  await describe('cellState', async () => {
    await it('treats a missing entry as empty', async () => {
      expect(cellState(null).kind).toBe('empty')
      expect(cellState(undefined).kind).toBe('empty')
    })

    await it('treats an entry without pictures as empty', async () => {
      expect(cellState({ frames: [] }).kind).toBe('empty')
    })

    await it('sums frame count and duration', async () => {
      expect(cellState({ frames: [{ duration: 100 }, { duration: 150 }] })).toStrictEqual({
        kind: 'filled',
        frames: 2,
        durationMs: 250,
      })
    })
  })

  await describe('cellMenuActions', async () => {
    await it('offers edit, play and clear on a filled cell, in that order', async () => {
      expect(cellMenuActions({ kind: 'filled', frames: 1, durationMs: 100 })).toStrictEqual(['edit', 'play', 'clear'])
    })

    await it('offers no menu on an empty cell', async () => {
      expect(cellMenuActions({ kind: 'empty' })).toStrictEqual([])
    })
  })

  await describe('cellTapIntent', async () => {
    await it('selects a filled cell and edits an empty one', async () => {
      expect(cellTapIntent({ kind: 'filled', frames: 1, durationMs: 100 })).toBe('select')
      expect(cellTapIntent({ kind: 'empty' })).toBe('edit')
    })
  })

  await describe('gridFits', async () => {
    await it('fits exactly at the minimum width', async () => {
      expect(gridFits(GRID_MIN_WIDTH)).toBe(true)
      expect(gridFits(GRID_MIN_WIDTH - 1)).toBe(false)
    })

    await it('does not fit a phone', async () => {
      expect(gridFits(352)).toBe(false)
    })
  })
}
