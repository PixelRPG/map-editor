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
  makeChunkGrid,
  makeIndexRange,
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
    await it('starts with every chunk dirty', async () => {
      const baked = new BakedChunksComponent(makeChunkGrid(40, 33))
      expect(baked.dirty.size).toBe(9)
    })
    await it('a tile edit dirties exactly its chunk', async () => {
      const baked = new BakedChunksComponent(makeChunkGrid(40, 33))
      baked.dirty.clear()
      baked.markTileDirty(17, 3)
      expect(String([...baked.dirty])).toBe('1')
    })
    await it('edits on both sides of a border dirty two chunks', async () => {
      const baked = new BakedChunksComponent(makeChunkGrid(40, 33))
      baked.dirty.clear()
      baked.markTileDirty(15, 0)
      baked.markTileDirty(16, 0)
      expect(String([...baked.dirty].sort())).toBe('0,1')
    })
    await it('an off-map edit dirties nothing', async () => {
      const baked = new BakedChunksComponent(makeChunkGrid(40, 33))
      baked.dirty.clear()
      baked.markTileDirty(-1, 5)
      baked.markTileDirty(40, 5)
      expect(baked.dirty.size).toBe(0)
    })
    await it('markAllDirty re-arms every chunk', async () => {
      const baked = new BakedChunksComponent(makeChunkGrid(40, 33))
      baked.dirty.clear()
      baked.markAllDirty()
      expect(baked.dirty.size).toBe(9)
    })
  })
}
