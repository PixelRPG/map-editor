import { Component } from 'excalibur'
import type { Facing } from '../types/data/index.ts'

/** Tile-grid waypoint for an NPC patrol route. */
export interface NpcWaypoint {
  tileX: number
  tileY: number
}

/**
 * Patrol route + initial facing for an entity that walks a fixed path.
 *
 * Split out of the old `NpcComponent` so each component maps 1:1 to a
 * registry spec. Pure data; a future `NpcMovementSystem` reads it and
 * keeps per-NPC runtime state (current waypoint index) on a separate
 * component so this one stays serialisable.
 */
export class NpcRouteComponent extends Component {
  constructor(
    public waypoints: NpcWaypoint[] = [],
    public facing?: Facing,
  ) {
    super()
  }
}
