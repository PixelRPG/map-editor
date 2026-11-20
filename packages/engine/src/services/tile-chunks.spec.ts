/**
 * Chunk indexing for the baked tile planes: which chunk a tile edit
 * dirties, and which chunks a viewport touches — including the border
 * cases (partial last chunk, rectangles off the map, exact borders).
 */

import { describe, expect, it } from '@gjsify/unit'
import { BakedChunksComponent } from '../components/baked-chunks.component.ts'
import {
  CHUNK_TILES,
  chunkCount,
  chunkIndexOfTile,
  chunkRangeOfRect,
  LOD_LEVELS,
  liveTileOverlap,
  lodLevelForScale,
  makeChunkGrid,
  makeIndexRange,
  maxLodLevel,
  tileRangeOfChunk,
} from './tile-chunks.ts'

export default async () => {
  await describe('makeChunkGrid', async () => {
    await it('rounds the chunk count up for maps that are not a multiple', async () => {
      const grid = makeChunkGrid(40, 33)
      expect(grid.chunkColumns).toBe(3)
      expect(grid.chunkRows).toBe(3)
      expect(chunkCount(grid)).toBe(9)
    })
    await it('an exact multiple gets no extra chunk', async () => {
      const grid = makeChunkGrid(32, 16)
      expect(grid.chunkColumns).toBe(2)
      expect(grid.chunkRows).toBe(1)
    })
  })

  await describe('chunkIndexOfTile', async () => {
    const grid = makeChunkGrid(40, 33)
    await it('puts the last tile of a chunk and the first of the next in different chunks', async () => {
      expect(chunkIndexOfTile(grid, CHUNK_TILES - 1, 0)).toBe(0)
      expect(chunkIndexOfTile(grid, CHUNK_TILES, 0)).toBe(1)
      expect(chunkIndexOfTile(grid, 0, CHUNK_TILES)).toBe(3)
    })
    await it('resolves the partial last chunk', async () => {
      expect(chunkIndexOfTile(grid, 39, 32)).toBe(8)
    })
    await it('returns -1 off the map', async () => {
      expect(chunkIndexOfTile(grid, -1, 0)).toBe(-1)
      expect(chunkIndexOfTile(grid, 0, -1)).toBe(-1)
      expect(chunkIndexOfTile(grid, 40, 0)).toBe(-1)
      expect(chunkIndexOfTile(grid, 0, 33)).toBe(-1)
    })
  })

  await describe('tileRangeOfChunk', async () => {
    const grid = makeChunkGrid(40, 33)
    await it('clamps the last chunk to the map', async () => {
      const r = tileRangeOfChunk(grid, 2, 2, makeIndexRange())
      expect(String([r.x0, r.y0, r.x1, r.y1])).toBe('32,32,40,33')
    })
    await it('a full chunk spans CHUNK_TILES', async () => {
      const r = tileRangeOfChunk(grid, 1, 0, makeIndexRange())
      expect(String([r.x0, r.y0, r.x1, r.y1])).toBe('16,0,32,16')
    })
  })

  await describe('chunkRangeOfRect', async () => {
    const grid = makeChunkGrid(40, 33)
    const range = (l: number, t: number, r: number, b: number) => {
      const o = chunkRangeOfRect(grid, 16, 16, l, t, r, b, makeIndexRange())
      return [o.x0, o.y0, o.x1, o.y1]
    }
    await it('a rect inside one chunk touches only that chunk', async () => {
      expect(String(range(10, 10, 200, 200))).toBe('0,0,1,1')
    })
    await it('a rect ending exactly on a chunk border does not touch the next', async () => {
      expect(String(range(0, 0, 256, 256))).toBe('0,0,1,1')
      expect(String(range(0, 0, 257, 256))).toBe('0,0,2,1')
    })
    await it('clamps a rect hanging off every side', async () => {
      expect(String(range(-500, -500, 99999, 99999))).toBe('0,0,3,3')
    })
    await it('is empty when wholly off the map or without area', async () => {
      const a = range(-300, -300, -10, -10)
      expect(a[2] <= a[0] || a[3] <= a[1]).toBe(true)
      const b = range(100, 100, 100, 100)
      expect(b[2] <= b[0] || b[3] <= b[1]).toBe(true)
      const c = range(99999, 0, 100000, 10)
      expect(c[2] <= c[0] || c[3] <= c[1]).toBe(true)
    })
  })

  await describe('BakedChunksComponent invalidation', async () => {
    const fresh = () => {
      const baked = new BakedChunksComponent(makeChunkGrid(40, 33))
      for (const set of baked.dirty) set.clear()
      return baked
    }
    await it('starts with every chunk dirty at every level', async () => {
      const baked = new BakedChunksComponent(makeChunkGrid(40, 33))
      for (let l = 0; l < LOD_LEVELS; l++) expect(baked.dirty[l].size).toBe(9)
    })
    await it('a tile edit dirties exactly its chunk, at every level', async () => {
      const baked = fresh()
      baked.markTileDirty(17, 3)
      for (let l = 0; l < LOD_LEVELS; l++) expect(String([...baked.dirty[l]])).toBe('1')
    })
    await it('baking one level leaves the others dirty', async () => {
      const baked = fresh()
      baked.markTileDirty(17, 3)
      baked.dirty[1].delete(1)
      expect(baked.dirty[1].size).toBe(0)
      expect(baked.dirty[0].size).toBe(1)
      expect(baked.dirty[2].size).toBe(1)
    })
    await it('edits on both sides of a border dirty two chunks', async () => {
      const baked = fresh()
      baked.markTileDirty(15, 0)
      baked.markTileDirty(16, 0)
      expect(String([...baked.dirty[0]].sort())).toBe('0,1')
    })
    await it('an off-map edit dirties nothing', async () => {
      const baked = fresh()
      baked.markTileDirty(-1, 5)
      baked.markTileDirty(40, 5)
      for (let l = 0; l < LOD_LEVELS; l++) expect(baked.dirty[l].size).toBe(0)
    })
    await it('markAllDirty re-arms every chunk at every level', async () => {
      const baked = fresh()
      baked.markAllDirty()
      for (let l = 0; l < LOD_LEVELS; l++) expect(baked.dirty[l].size).toBe(9)
    })
    await it('evictLevel drops that level only and re-arms its chunks', async () => {
      const baked = fresh()
      baked.slots[0][0] = { canvas: null, live: [], width: 1, height: 1, placeholder: null }
      baked.slots[1][0] = { canvas: null, live: [], width: 1, height: 1, placeholder: null }
      expect(baked.hasLevel(1)).toBe(true)
      baked.evictLevel(1)
      expect(baked.hasLevel(1)).toBe(false)
      expect(baked.hasLevel(0)).toBe(true)
      expect(baked.dirty[1].size).toBe(9)
      expect(baked.dirty[0].size).toBe(0)
    })
  })

  await describe('lodLevelForScale', async () => {
    await it('zoom 1 and above is full resolution', async () => {
      expect(lodLevelForScale(1, 2)).toBe(0)
      expect(lodLevelForScale(3, 2)).toBe(0)
    })
    await it('[0.5, 1) uses the half level', async () => {
      expect(lodLevelForScale(0.999, 2)).toBe(1)
      expect(lodLevelForScale(0.5, 2)).toBe(1)
    })
    await it('below 0.5 uses the quarter level', async () => {
      expect(lodLevelForScale(0.499, 2)).toBe(2)
      expect(lodLevelForScale(0.1, 2)).toBe(2)
    })
    await it('is clamped to the deepest level the tile size allows', async () => {
      expect(lodLevelForScale(0.1, 1)).toBe(1)
      expect(lodLevelForScale(0.1, 0)).toBe(0)
    })
  })

  await describe('maxLodLevel', async () => {
    await it('16 px tiles divide down to the quarter level', async () => {
      expect(maxLodLevel(16, 16)).toBe(2)
    })
    await it('stops where the tile no longer divides evenly', async () => {
      expect(maxLodLevel(18, 18)).toBe(1)
      expect(maxLodLevel(17, 16)).toBe(0)
      expect(maxLodLevel(16, 18)).toBe(1)
    })
  })

  await describe('liveTileOverlap', async () => {
    await it('is 0 at integer scales of 1 and above', async () => {
      expect(liveTileOverlap(1)).toBe(0)
      expect(liveTileOverlap(2)).toBe(0)
      expect(liveTileOverlap(4)).toBe(0)
    })
    await it('is one screen pixel at fractional scales', async () => {
      expect(liveTileOverlap(2.5)).toBe(0.4)
      expect(liveTileOverlap(0.5)).toBe(2)
      expect(liveTileOverlap(1.37) > 0).toBe(true)
    })
    await it('is 0 for degenerate scales', async () => {
      expect(liveTileOverlap(0)).toBe(0)
      expect(liveTileOverlap(Number.NaN)).toBe(0)
    })
  })
}
