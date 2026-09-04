import type { AwarenessCursor } from './awareness.ts'

/**
 * Rate limiter for outgoing cursor frames.
 *
 * A 240-Hz mouse would otherwise flood the unreliable channel with
 * redundant positions. Coalescing keeps the wire under ~33 Hz while
 * staying **edge-correct**: the last cursor offered always reaches the
 * wire eventually, because a coalesced position is held and released by
 * the next call past the window.
 *
 * Pure state machine — the clock is a parameter, so the window
 * behaviour tests without timers.
 */
export class CursorThrottle {
  // `-Infinity` so the FIRST offer always passes, regardless of where
  // the wall-clock starts. A literal `0` would accidentally throttle the
  // first frame when `now()` itself returns something close to 0 (test
  // clocks, monotonic clocks reset at process start).
  private lastSentMs = -Infinity
  private pending: AwarenessCursor | null = null

  constructor(private readonly windowMs: number) {}

  /**
   * Offer a cursor position. Returns the cursor to put on the wire, or
   * `null` when it was coalesced into the current window. A newer
   * position supersedes any pending one — the stale coalesced value is
   * dropped, never sent late.
   */
  offer(cursor: AwarenessCursor, now: number): AwarenessCursor | null {
    if (now - this.lastSentMs < this.windowMs) {
      this.pending = cursor
      return null
    }
    this.lastSentMs = now
    this.pending = null
    return cursor
  }

  /**
   * Release a coalesced position once its window has elapsed. Returns
   * `null` when nothing is pending or the window is still open. Call
   * from a UI timer so the peer sees the final pointer position even
   * when the local mouse stops moving mid-window.
   */
  flush(now: number): AwarenessCursor | null {
    if (!this.pending) return null
    if (now - this.lastSentMs < this.windowMs) return null
    const cursor = this.pending
    this.pending = null
    this.lastSentMs = now
    return cursor
  }
}
