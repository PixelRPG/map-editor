import { Component } from 'excalibur'
import type { RegionGrid } from '../services/collision-regions.ts'

/**
 * Which regions of a tilemap currently hold solid-tile colliders.
 *
 * Attached to every {@link PlaneTileMap}. `CollisionRegionSystem` writes
 * it as physics-active bodies move; the tilemap reads it when it builds
 * its composite collider. Runtime-only, never serialised.
 */
export class CollisionRegionsComponent extends Component {
  /** One byte per region: 1 = colliders built. */
  public readonly active: Uint8Array
  /** Scratch mask the system fills each tick, so a tick allocates nothing. */
  public readonly next: Uint8Array
  constructor(public readonly grid: RegionGrid) {
    super()
    this.active = new Uint8Array(grid.count)
    this.next = new Uint8Array(grid.count)
  }
}
