/**
 * The armed brush as a block of tiles.
 *
 * The properties worth holding, beyond the individual coordinates:
 *
 *   1. A single tile is genuinely the 1×1 case — `singleTileStamp`
 *      round-trips through `stampAnchorId` and writes exactly the one
 *      cell the pencil has always written, so widening the brush
 *      cannot change what the common case paints.
 *   2. Nothing that is not a rectangle can be armed: a run of ids that
 *      does not divide by the column count is refused rather than
 *      padded into a torn last row.
 *   3. The hovered tile is the stamp's FIRST tile, for every size —
 *      the property that makes a 4×3 brush as predictable as a 1×1.
 *   4. A stamp at the map's edge writes the part that fits. The
 *      alternative (refusing) would leave the last row of every map
 *      paintable only with a single-tile brush.
 */

import { describe, expect, it } from '@gjsify/unit'

import { isSingleTileStamp, makeTileStamp, singleTileStamp, stampAnchorId, stampCellsAt } from './tile-stamp.ts'

const BOUNDS = { columns: 4, rows: 3 }

export default async () => {
  await describe('singleTileStamp', async () => {
    await it('is the 1×1 case of a stamp', async () => {
      const stamp = singleTileStamp(7)
      expect(isSingleTileStamp(stamp)).toBe(true)
      expect(stampAnchorId(stamp)).toBe(7)
      expect(stampCellsAt(stamp, { x: 2, y: 1 })).toStrictEqual([{ tileX: 2, tileY: 1, spriteId: 7 }])
    })
  })

  await describe('makeTileStamp', async () => {
    await it('reads a run of ids row-major', async () => {
      const stamp = makeTileStamp([1, 2, 3, 4, 5, 6], 3)
      expect(stamp?.columns).toBe(3)
      expect(stamp?.rows).toBe(2)
      expect(stamp && isSingleTileStamp(stamp)).toBe(false)
    })

    await it('refuses a run that is not a whole number of rows', async () => {
      expect(makeTileStamp([1, 2, 3, 4, 5], 3)).toBeNull()
    })

    await it('refuses an empty run and a non-positive column count', async () => {
      expect(makeTileStamp([], 2)).toBeNull()
      expect(makeTileStamp([1, 2], 0)).toBeNull()
      expect(makeTileStamp([1, 2], 1.5)).toBeNull()
    })

    await it('copies the ids it was handed', async () => {
      const source = [1, 2]
      const stamp = makeTileStamp(source, 1)
      source[0] = 99
      expect(stamp?.spriteIds[0]).toBe(1)
    })
  })

  await describe('stampAnchorId', async () => {
    await it('is the top-left tile, not the first non-empty one', async () => {
      const stamp = makeTileStamp([0, 5, 6, 7], 2)
      expect(stamp && stampAnchorId(stamp)).toBeNull()
    })
  })

  await describe('stampCellsAt', async () => {
    await it('anchors the block top-left on the hovered tile', async () => {
      const stamp = makeTileStamp([1, 2, 3, 4], 2)
      expect(stamp && stampCellsAt(stamp, { x: 1, y: 1 })).toStrictEqual([
        { tileX: 1, tileY: 1, spriteId: 1 },
        { tileX: 2, tileY: 1, spriteId: 2 },
        { tileX: 1, tileY: 2, spriteId: 3 },
        { tileX: 2, tileY: 2, spriteId: 4 },
      ])
    })

    await it('skips a hole instead of erasing it', async () => {
      const stamp = makeTileStamp([1, 0, -3, 4], 2)
      expect(stamp && stampCellsAt(stamp, { x: 0, y: 0 })).toStrictEqual([
        { tileX: 0, tileY: 0, spriteId: 1 },
        { tileX: 1, tileY: 1, spriteId: 4 },
      ])
    })

    await it('clips to the map, keeping the part that fits', async () => {
      const stamp = makeTileStamp([1, 2, 3, 4], 2)
      expect(stamp && stampCellsAt(stamp, { x: 3, y: 2 }, BOUNDS)).toStrictEqual([{ tileX: 3, tileY: 2, spriteId: 1 }])
    })

    await it('clips a negative origin, which is how an off-map hover reads', async () => {
      const stamp = makeTileStamp([1, 2, 3, 4], 2)
      expect(stamp && stampCellsAt(stamp, { x: -1, y: -1 }, BOUNDS)).toStrictEqual([
        { tileX: 0, tileY: 0, spriteId: 4 },
      ])
    })

    await it('writes nothing when the whole block is off the map', async () => {
      const stamp = makeTileStamp([1, 2], 2)
      expect(stamp && stampCellsAt(stamp, { x: 9, y: 9 }, BOUNDS)).toStrictEqual([])
    })
  })
}
