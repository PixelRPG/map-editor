/**
 * Pure tile↔world coordinate math used by the assistant-presence cursor
 * and flash-tile highlight (both anchor to the tile *centre*).
 *
 * Pinned independently of a live Excalibur scene. The `+ 0.5` centre
 * offset is the bit that keeps the AI cursor dot and the "AI painted
 * here" flash in the middle of the tile rather than its corner.
 */

import { describe, expect, it } from '@gjsify/unit'

import { isTileOutOfBounds, tileToWorldCenter, worldToTile } from './tile-geometry.ts'

export default async () => {
  await describe('tileToWorldCenter', async () => {
    await it('centres the origin tile at half a cell', async () => {
      expect(tileToWorldCenter({ x: 0, y: 0 }, 16, 16, 0, 0)).toStrictEqual({ x: 8, y: 8 })
    })

    await it('offsets by the tilemap origin', async () => {
      expect(tileToWorldCenter({ x: 100, y: 200 }, 16, 16, 0, 0)).toStrictEqual({ x: 108, y: 208 })
    })

    await it('handles non-square cells', async () => {
      // tile (1,1) centre = origin + (1.5 * w, 1.5 * h).
      expect(tileToWorldCenter({ x: 0, y: 0 }, 32, 16, 1, 1)).toStrictEqual({ x: 48, y: 24 })
    })

    await it('handles negative tile coordinates', async () => {
      expect(tileToWorldCenter({ x: 0, y: 0 }, 16, 16, -1, -1)).toStrictEqual({ x: -8, y: -8 })
    })

    await it('scales linearly across tiles', async () => {
      expect(tileToWorldCenter({ x: 0, y: 0 }, 16, 16, 2, 3)).toStrictEqual({ x: 40, y: 56 })
    })
  })

  await describe('isTileOutOfBounds', async () => {
    await it('accepts tiles inside the map', async () => {
      expect(isTileOutOfBounds(0, 0, 10, 10)).toBe(false)
      expect(isTileOutOfBounds(5, 5, 10, 10)).toBe(false)
    })

    await it('accepts the last in-bounds tile (exclusive upper bound)', async () => {
      expect(isTileOutOfBounds(9, 9, 10, 10)).toBe(false)
    })

    await it('rejects tiles at or past the column/row count', async () => {
      expect(isTileOutOfBounds(10, 0, 10, 10)).toBe(true)
      expect(isTileOutOfBounds(0, 10, 10, 10)).toBe(true)
    })

    await it('rejects negative coordinates', async () => {
      expect(isTileOutOfBounds(-1, 0, 10, 10)).toBe(true)
      expect(isTileOutOfBounds(0, -1, 10, 10)).toBe(true)
      expect(isTileOutOfBounds(-1, -1, 10, 10)).toBe(true)
    })

    await it('treats a zero-sized map as all-out-of-bounds', async () => {
      expect(isTileOutOfBounds(0, 0, 0, 0)).toBe(true)
    })
  })

  await describe('worldToTile', async () => {
    await it('floors a world point into its cell', async () => {
      expect(worldToTile(0, 0, 16, 16)).toStrictEqual({ x: 0, y: 0 })
      expect(worldToTile(15.9, 15.9, 16, 16)).toStrictEqual({ x: 0, y: 0 })
      expect(worldToTile(16, 16, 16, 16)).toStrictEqual({ x: 1, y: 1 })
    })

    await it('handles non-square cells', async () => {
      expect(worldToTile(33, 17, 32, 16)).toStrictEqual({ x: 1, y: 1 })
    })

    await it('does not clamp past the grid — negatives floor away from zero', async () => {
      expect(worldToTile(-1, -1, 16, 16)).toStrictEqual({ x: -1, y: -1 })
      expect(worldToTile(1_000, 1_000, 16, 16)).toStrictEqual({ x: 62, y: 62 })
    })

    await it('round-trips the centre of a tile back to that tile', async () => {
      const centre = tileToWorldCenter({ x: 0, y: 0 }, 16, 16, 3, 4)
      expect(worldToTile(centre.x, centre.y, 16, 16)).toStrictEqual({ x: 3, y: 4 })
    })
  })
}
