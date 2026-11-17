import { describe, expect, it } from '@gjsify/unit'

import { fitTerrainPatch, TERRAIN_PATCH_CELLS, TERRAIN_THUMB_PX } from './terrain-thumbnail.geometry.ts'

export default async () => {
  await describe('fitTerrainPatch', async () => {
    await it("draws the pack's 16 px tiles at 1× in a chip-sized box", async () => {
      const fit = fitTerrainPatch(TERRAIN_THUMB_PX, TERRAIN_THUMB_PX, 16)
      expect(fit?.cell).toBe(16)
      expect(fit?.x).toBe(0)
      expect(fit?.y).toBe(0)
    })

    await it('clamps an upscale to a whole factor and centres the remainder', async () => {
      // 56 / 3 = 18.67 px a cell — ragged. 1× it is, with 4 px a side.
      const fit = fitTerrainPatch(56, 56, 16)
      expect(fit?.cell).toBe(16)
      expect(fit?.x).toBe(4)
      // Twice the room is exactly 2×, not 2.33×.
      expect(fitTerrainPatch(112, 112, 16)?.cell).toBe(32)
    })

    await it('takes the fractional scale when the tiles are too big to fit whole', async () => {
      // A 32 px tileset in the same chip: 16 px a cell beats nothing at all.
      expect(fitTerrainPatch(TERRAIN_THUMB_PX, TERRAIN_THUMB_PX, 32)?.cell).toBe(16)
      expect(fitTerrainPatch(10, 10, 32)?.cell).toBe(3)
    })

    await it('never reports a patch wider than its box', async () => {
      for (const box of [3, 7, 20, 48, 49, 100]) {
        const fit = fitTerrainPatch(box, box, 16)
        if (!fit) throw new Error(`no fit for ${box}`)
        expect(fit.cell * TERRAIN_PATCH_CELLS <= box).toBe(true)
      }
    })

    await it('has nothing to say about an unallocated widget', async () => {
      expect(fitTerrainPatch(0, 48, 16)).toBe(null)
      expect(fitTerrainPatch(48, 48, 0)).toBe(null)
      // Three slivers are not a patch.
      expect(fitTerrainPatch(2, 2, 16)).toBe(null)
    })
  })
}
