import { Component } from 'excalibur'
import type { TerrainAddress } from '../resource/terrain.ts'

/**
 * The armed terrain brush in the editor — "the next stroke lays Path",
 * as opposed to "the next stroke lays tile 406". Lives on the
 * session-singleton (see `docs/concepts/editor-architecture.md`).
 *
 * **Mutually exclusive with {@link ActiveTileComponent}**: a tile and a
 * terrain are two answers to the same question, so at most one of the
 * two components exists at a time and `EditorSession` owns the write
 * that keeps it that way (TERRAIN.md §6.2). Nothing else may set
 * either component.
 *
 * The tool stays `pencil` while a terrain is armed — a terrain is
 * *what* is painted, not a sixth tool — so the toolbar, the shortcuts
 * and the tool guard chain are untouched.
 *
 * Unlike the tile brush there is no global id here: a terrain is
 * addressed by `(spriteSetId, terrainId)` and its table holds the
 * set's LOCAL sprite ids, so no `firstGid` offset ever enters.
 */
export class ActiveTerrainComponent extends Component {
  readonly spriteSetId: string
  readonly terrainId: string

  constructor(address: TerrainAddress) {
    super()
    this.spriteSetId = address.spriteSetId
    this.terrainId = address.terrainId
  }

  /** The brush as the address every terrain helper takes. */
  get address(): TerrainAddress {
    return { spriteSetId: this.spriteSetId, terrainId: this.terrainId }
  }
}
