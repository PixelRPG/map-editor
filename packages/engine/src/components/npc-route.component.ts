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
 * registry spec. Pure data: the cursor into the route (which waypoint is
 * next) lives on the walking system's own runtime component, so this one
 * stays serialisable.
 *
 * Its first reader is `HostileAiSystem`, which walks these waypoints for
 * a `patrol` enemy — which means a peaceful NPC still stands still. The
 * general `NpcMovementSystem` that walks a route without a fight
 * attached is still unbuilt (TODO.md, "Engine / runtime"); when it
 * lands, both readers share this one shape.
 */
export class NpcRouteComponent extends Component {
  constructor(
    public waypoints: NpcWaypoint[] = [],
    public facing?: Facing,
  ) {
    super()
  }
}
