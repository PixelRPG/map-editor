import { describe, expect, it } from '@gjsify/unit'

import { pushRecent, RECENT_BUTTON_PX, RECENT_PITCH_PX, RECENT_TILES_MAX, wholeCount } from './recent-tiles.geometry.ts'

/** The strip's own numbers: 44 px buttons on a 48 px pitch. */
const TILE = RECENT_BUTTON_PX
const GAP = RECENT_PITCH_PX - RECENT_BUTTON_PX
const eight = Array.from({ length: RECENT_TILES_MAX }, () => TILE)

export default async () => {
  await describe('pushRecent', async () => {
    await it('moves a re-used tile to the front instead of adding it twice', async () => {
      expect(pushRecent([3, 5, 7], 5)).toStrictEqual([5, 3, 7])
    })

    await it('keeps the tiles a meadow alternates between while capping the list', async () => {
      let recent: number[] = []
      for (let id = 0; id < 20; id++) recent = pushRecent(recent, id)
      expect(recent.length).toBe(RECENT_TILES_MAX)
      // Alternating two tiles never pushes either out.
      for (let i = 0; i < 10; i++) recent = pushRecent(recent, i % 2 === 0 ? 19 : 18)
      expect(recent.slice(0, 2).sort()).toStrictEqual([18, 19])
    })
  })

  await describe('wholeCount', async () => {
    await it('fits six tiles into the 288 px a 360 px phone leaves the strip', async () => {
      // 360 − 24 bar margins − 4 gap − 44 "⌃" = 288; six tiles span 284.
      expect(wholeCount(eight, GAP, 288)).toBe(6)
    })

    await it('never counts a tile the edge would cut', async () => {
      // One pixel short of the seventh tile's right edge is still six.
      expect(wholeCount(eight, GAP, 7 * TILE + 6 * GAP - 1)).toBe(6)
      expect(wholeCount(eight, GAP, 7 * TILE + 6 * GAP)).toBe(7)
    })

    await it('shows all eight when they fit', async () => {
      expect(wholeCount(eight, GAP, 8 * TILE + 7 * GAP)).toBe(8)
      expect(wholeCount(eight, GAP, 1000)).toBe(8)
    })

    await it('shows nothing when not even one fits, and nothing of nothing', async () => {
      expect(wholeCount(eight, GAP, TILE - 1)).toBe(0)
      expect(wholeCount([], GAP, 288)).toBe(0)
    })

    await it('takes each tile at its own width', async () => {
      expect(wholeCount([44, 44, 100, 44], GAP, 44 + GAP + 44 + GAP + 100)).toBe(3)
      expect(wholeCount([44, 44, 100, 44], GAP, 44 + GAP + 44 + GAP + 99)).toBe(2)
    })
  })
}
