import { describe, expect, it } from '@gjsify/unit'

import {
  fitTerrainGrid,
  fitTerrainPatch,
  TERRAIN_PATCH_CELLS,
  TERRAIN_THUMB_PX,
  terrainGridCellAt,
} from './terrain-thumbnail.geometry.ts'

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

  await describe('fitTerrainGrid', async () => {
    await it('agrees with fitTerrainPatch on the square case', async () => {
      for (const box of [7, 20, 48, 56, 112]) {
        const patch = fitTerrainPatch(box, box, 16)
        const grid = fitTerrainGrid(box, box, 16, TERRAIN_PATCH_CELLS, TERRAIN_PATCH_CELLS)
        expect(`${grid?.cell} ${grid?.x} ${grid?.y}`).toBe(`${patch?.cell} ${patch?.x} ${patch?.y}`)
      }
    })

    await it('is limited by the tighter axis, not by the smaller side', async () => {
      // 14 × 10 of 16 px wants 224 × 160. A box 480 wide but only 200
      // tall fits once vertically, not twice — the width alone would
      // have said 2×.
      expect(fitTerrainGrid(480, 200, 16, 14, 10)?.cell).toBe(16)
      expect(fitTerrainGrid(480, 340, 16, 14, 10)?.cell).toBe(32)
    })

    await it('centres the grid in both directions', async () => {
      const fit = fitTerrainGrid(300, 200, 16, 14, 10)
      expect(fit?.cell).toBe(16)
      expect(fit?.x).toBe(38)
      expect(fit?.y).toBe(20)
    })

    await it('has nothing to say about an empty grid or box', async () => {
      expect(fitTerrainGrid(300, 200, 16, 0, 10)).toBe(null)
      expect(fitTerrainGrid(300, 200, 16, 14, 0)).toBe(null)
      expect(fitTerrainGrid(10, 200, 16, 14, 10)).toBe(null)
    })
  })

  await describe('terrainGridCellAt', async () => {
    // The 14 × 10 sample in a 300 × 200 box: 16 px cells, inset 38 / 20.
    const fit = fitTerrainGrid(300, 200, 16, 14, 10)

    await it('finds the cell a point is inside', async () => {
      expect(terrainGridCellAt(fit, 14, 10, 38, 20)).toBe(0)
      expect(terrainGridCellAt(fit, 14, 10, 53, 35)).toBe(0)
      expect(terrainGridCellAt(fit, 14, 10, 54, 36)).toBe(15)
      expect(terrainGridCellAt(fit, 14, 10, 38 + 13 * 16, 20 + 9 * 16)).toBe(139)
    })

    await it('misses in the centring margin instead of rounding inwards', async () => {
      expect(terrainGridCellAt(fit, 14, 10, 37, 20)).toBe(null)
      expect(terrainGridCellAt(fit, 14, 10, 38, 19)).toBe(null)
      expect(terrainGridCellAt(fit, 14, 10, 38 + 14 * 16, 20)).toBe(null)
      expect(terrainGridCellAt(fit, 14, 10, 38, 20 + 10 * 16)).toBe(null)
    })

    await it('misses when there is no grid at all', async () => {
      expect(terrainGridCellAt(null, 14, 10, 40, 40)).toBe(null)
    })
  })
}
