import { Component } from 'excalibur'

/** One hostile waiting to come back, and the placement to rebuild it from. */
export interface PendingRespawn {
  /** `ObjectPlacement.id` — the stable key, never an Excalibur entity id. */
  placementId: string
  /** Session clock reading at which the placement respawns. */
  atMs: number
}

/**
 * `combat-action`'s per-scene session state, on the session singleton.
 *
 * Holds the things that are true of the *playthrough* rather than of any
 * one actor: the shared clock, the attack button's edge, the swing
 * cooldown, the respawn queue, and how many hearts the HUD has drawn.
 *
 * **The clock.** Excalibur hands each system an elapsed-ms delta, not a
 * timestamp, and combat needs a common now: a swing cooldown, an i-frame
 * window and a respawn timer that disagreed about the time would drift
 * apart. `MeleeAttackSystem` — first of the system list — advances
 * `nowMs` once per tick and every later combat system reads it. Keeping
 * it here rather than on a system is the same rule
 * `PlayerSessionComponent` follows: systems are stateless, scenes are not.
 */
export class CombatSessionComponent extends Component {
  /** Milliseconds elapsed in this scene, advanced by `MeleeAttackSystem`. */
  public nowMs = 0
  /** Edge-trigger for the attack button — true while it is held down. */
  public attackWasHeld = false
  /** Clock reading before which the hero may not swing again. */
  public nextSwingAtMs = 0
  /** Hostiles due to come back, in no particular order. */
  public respawns: PendingRespawn[] = []
  /** Hearts currently in the HUD row — a change rebuilds it. */
  public renderedMaxHp = -1
}
