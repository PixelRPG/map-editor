import { Component } from 'excalibur'

/**
 * Per-scene player runtime session state for {@link PlayerSystem}.
 *
 * Lives on the session-singleton via `SessionState` so the cross-tick
 * mode-transition + input-edge-detect state stays on a scene-attached
 * component instead of the system instance (per AGENTS.md "all
 * persistent state lives in components or scene-attached resources").
 *
 * Coordinates are scalar numbers so the component round-trips as
 * JSON and the per-tick tile-change update mutates fields in place
 * (one fewer allocation per crossing — the event payload's `previous`
 * object remains a fresh alloc since the bus broadcasts it).
 *
 * `lastTileX === null` means "no previous tile tracked yet" (first
 * frame after spawn / mode flip).
 */
export class PlayerSessionComponent extends Component {
  public lastTileX: number | null = null
  public lastTileY: number | null = null
  /** Previous-tick runtime-mode flag — drives editor↔runtime transition detection. */
  public wasInRuntime = false
  /** Edge-trigger for Space / Enter — true while the key is held down. */
  public actionWasHeld = false
  /** Whether the camera is currently locked onto the player actor. */
  public cameraLocked = false
}
