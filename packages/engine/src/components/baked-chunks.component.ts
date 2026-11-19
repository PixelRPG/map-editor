import { type Color, Component, type Tile } from 'excalibur'
import {
  type ChunkGrid,
  chunkCount,
  chunkIndexOfTile,
  type IndexRange,
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
 * `slots[level]` is indexed by flat chunk index. Only level 0 (full
 * resolution) exists today; the array shape is the seam a downscaled
 * level of detail plugs into without touching the dirty set.
 */
export class BakedChunksComponent extends Component {
  public readonly dirty = new Set<number>()
  public readonly slots: (ChunkSlot | undefined)[][] = [[]]
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
    if (index >= 0) this.dirty.add(index)
  }

  markAllDirty(): void {
    for (let i = 0, n = chunkCount(this.grid); i < n; i++) this.dirty.add(i)
  }
}
