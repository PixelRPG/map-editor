import { Component } from 'excalibur'

/**
 * Per-scene session state for {@link StatsSystem}, on the session
 * singleton — the cross-tick mode edge the system needs and is not
 * allowed to keep on itself (AGENTS.md: "systems hold no persistent
 * state beyond per-tick scratch").
 *
 * Mirrors `PlayerSessionComponent.wasInRuntime`, which cannot be reused
 * for this: `PlayerSystem` overwrites it every tick before `StatsSystem`
 * runs, so by the time stats looks the rising edge is already gone.
 */
export class StatsSessionComponent extends Component {
  /** Previous-tick runtime-mode flag — drives the re-seed on Play. */
  public wasInRuntime = false
}
