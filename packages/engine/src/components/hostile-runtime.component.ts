import { Component } from 'excalibur'

/**
 * One hostile's live AI state: where it is along its patrol, when it may
 * next land a contact hit, and the movement speed resolved once at first
 * sight.
 *
 * Attached by {@link HostileAiSystem} the first time it sees a hostile,
 * for the same reason {@link StatsRuntimeComponent} exists: the authored
 * {@link HostileComponent} must stay a clean serialisable shape, so the
 * per-entity cursor the AI advances lives beside it rather than in it —
 * and, because it lives on the entity, the system itself stays stateless.
 */
export class HostileRuntimeComponent extends Component {
  constructor(
    /** Speed in px/sec, resolved from `movement` (or the fallback) once. */
    public readonly speedPxPerSec: number,
    /** Index into `NpcRouteComponent.waypoints` while patrolling. */
    public waypointIndex = 0,
    /** Session clock reading before which no further contact hit lands. */
    public nextAttackAtMs = 0,
  ) {
    super()
  }
}
