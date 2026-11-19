import { type Color, Component, type Tile } from 'excalibur'
import {
  type ChunkGrid,
  chunkCount,
  chunkIndexOfTile,
  type IndexRange,
  LOD_LEVELS,
  makeIndexRange,
} from '../services/tile-chunks.ts'

/** One chunk's baked texture at one level of detail. */
export interface ChunkSlot {
  /** Baked pixels; `null` while the chunk has nothing static to show. */
  canvas: HTMLCanvasElement | null
  /** Tiles drawn live on top: animated or oddly shaped content. */
  live: Tile[]
  /** Pixel size of `canvas` (the last chunk of a map may be partial). */
  width: number
  height: number
  /** Flat stand-in shown until the first bake of this chunk. */
  placeholder: Color | null
}

/**
 * Baked texture cache of one plane's `TileMap` (see
 * `services/baked-chunks.ts`). Pure data: the dirty set says which
 * chunks no longer match their tiles, the slots hold what was baked.
 *
 * `slots[level]` is indexed by flat chunk index; level `n` is baked at
 * `1 / 2^n` resolution and only when something drew it. Every level has
 * its own dirty set, because a level that is not on screen still goes
 * stale: a tile edit dirties its chunk at ALL levels, and each level
 * re-bakes it when (if) it is next drawn.
 */
export class BakedChunksComponent extends Component {
  public readonly dirty: Set<number>[] = Array.from({ length: LOD_LEVELS }, () => new Set<number>())
  public readonly slots: (ChunkSlot | undefined)[][] = Array.from({ length: LOD_LEVELS }, () => [])
  /** `performance.now()` of the last draw that showed each level; drives eviction. */
  public readonly lastUsed: number[] = Array.from({ length: LOD_LEVELS }, () => 0)
  /** Reused per-frame ranges, so drawing allocates nothing. */
  public readonly scratchChunks: IndexRange = makeIndexRange()
  public readonly scratchTiles: IndexRange = makeIndexRange()
  /** Dirty visible chunks of the current draw, nearest the view centre first. */
  public readonly scratchPending: number[] = []
  public readonly scratchDistance: Float64Array

  constructor(public readonly grid: ChunkGrid) {
    super()
    this.scratchDistance = new Float64Array(chunkCount(grid))
    this.markAllDirty()
  }

  markTileDirty(tileX: number, tileY: number): void {
    const index = chunkIndexOfTile(this.grid, tileX, tileY)
    if (index >= 0) for (const set of this.dirty) set.add(index)
  }

  markAllDirty(): void {
    for (const set of this.dirty) for (let i = 0, n = chunkCount(this.grid); i < n; i++) set.add(i)
  }

  /** Drop one level's textures; its chunks are dirty again, so drawing it later re-bakes them. */
  evictLevel(level: number): void {
    this.slots[level].length = 0
    for (let i = 0, n = chunkCount(this.grid); i < n; i++) this.dirty[level].add(i)
  }

  /** Whether a level currently holds any baked or placeholder slot. */
  hasLevel(level: number): boolean {
    return this.slots[level].length > 0
  }
}
