import { Component } from 'excalibur'
import { type TileStamp, singleTileStamp, stampAnchorId } from '../resource/tile-stamp.ts'

/**
 * The armed tile brush in the editor. Absent between selections (right
 * after project load + before the user clicks a swatch). Lives on the
 * session-singleton (see `docs/concepts/editor-architecture.md`).
 *
 * Holds a {@link TileStamp} — a rectangular block of tiles — and a
 * single tile is its 1×1 case. ONE armed-brush shape rather than a
 * tile id beside a stamp, so no mutating path has to decide which of
 * two states to read.
 *
 * Every id in the stamp is a **global** tile id: the engine pre-adds
 * the sprite-set's `firstGid` to the local sprite index when writing
 * here, so reads downstream don't need to remember the offset.
 */
export class ActiveTileComponent extends Component {
  readonly stamp: TileStamp

  constructor(stamp: TileStamp | number) {
    super()
    this.stamp = typeof stamp === 'number' ? singleTileStamp(stamp) : stamp
  }

  /**
   * The block's top-left tile id, or `null` when it has none — what
   * every surface that can show only one tile reads (the context chip,
   * the bucket fill, the single-tile pencil).
   */
  get spriteId(): number | null {
    return stampAnchorId(this.stamp)
  }
}
