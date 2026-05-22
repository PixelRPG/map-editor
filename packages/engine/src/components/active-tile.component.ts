import { Component } from 'excalibur'

/**
 * Currently selected tile in the editor. `null` between selections
 * (right after project load + before the user clicks a swatch). Lives
 * on the session-singleton (see `docs/concepts/editor-architecture.md`).
 *
 * `spriteId` is the **global** tile id — the engine already pre-adds
 * the sprite-set's `firstGid` to the local sprite index when writing
 * to this component. Reads downstream don't need to remember the
 * offset.
 */
export class ActiveTileComponent extends Component {
  constructor(public spriteId: number) {
    super()
  }
}
