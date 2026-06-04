import { Component } from 'excalibur'

/**
 * Pointer-gesture state for {@link PointerGestureSystem}.
 *
 * Lives on the session-singleton (via `SessionState`) so the
 * cross-tick press / drag state stays on a scene-attached
 * component instead of the system instance — per AGENTS.md
 * doctrine "all persistent state lives in components or
 * scene-attached resources".
 *
 * Coordinates are stored as scalar numbers rather than
 * `ex.Vector` so the component round-trips as JSON and the
 * move callback can update fields in place without allocating
 * fresh Vector instances per pointer event.
 *
 * `pressX === null` means "no press is active"; the other
 * fields are dirty in that case and must be reset on the next
 * `down` event.
 */
export class PointerGestureSessionComponent extends Component {
  public pressX: number | null = null
  public pressY: number | null = null
  public lastX = 0
  public lastY = 0
  public dragging = false
}
