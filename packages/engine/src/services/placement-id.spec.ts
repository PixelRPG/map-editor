import { describe, expect, it } from '@gjsify/unit'

import { makePlacementId } from './placement-id.ts'

export default async () => {
  await describe('makePlacementId', async () => {
    await it('encodes the tile coords in the id for readability', async () => {
      expect(makePlacementId(3, 7).startsWith('obj_3_7_')).toBe(true)
      expect(makePlacementId(0, 0).startsWith('obj_0_0_')).toBe(true)
    })

    await it('never collides across many placements on the SAME tile in one session', async () => {
      const ids = new Set<string>()
      for (let i = 0; i < 5_000; i++) {
        ids.add(makePlacementId(4, 4))
      }
      // The old coords + 6-char-random form had no per-session uniqueness
      // guarantee for same-tile placements; the monotonic counter does.
      expect(ids.size).toBe(5_000)
    })

    await it('produces distinct ids for distinct tiles', async () => {
      expect(makePlacementId(1, 2)).not.toBe(makePlacementId(1, 2))
      expect(makePlacementId(10, 20)).not.toBe(makePlacementId(20, 10))
    })
  })
}
