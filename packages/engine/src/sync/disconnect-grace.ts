/**
 * Grace window before a transient WebRTC `disconnected` is treated as a
 * hard close.
 *
 * `disconnected` is transient by spec: the ICE agent uses it for a
 * momentary consent blip (Wi-Fi hiccup, brief packet loss) that usually
 * recovers to `connected` on its own. Only `failed` is terminal.
 * Closing on the first `disconnected` therefore drops sessions that
 * would have healed themselves a second later.
 *
 * The window measures from the FIRST `disconnected` transition — a
 * second one inside an open window does not extend it, or a flapping
 * connection would never elapse.
 */
export class DisconnectGrace {
  private timer: ReturnType<typeof setTimeout> | null = null

  /**
   * @param graceMs Window length. `0` still defers by one macrotask
   *   rather than firing inline, so callers (and tests) see the same
   *   "the elapse happens later" shape at every setting.
   * @param onElapsed Called when the window closes; the caller re-checks
   *   the live connection state before acting on it.
   */
  constructor(
    private readonly graceMs: number,
    private readonly onElapsed: () => void,
  ) {}

  /** Start the window if one is not already running. */
  schedule(): void {
    if (this.timer !== null) return
    this.timer = setTimeout(
      () => {
        this.timer = null
        this.onElapsed()
      },
      Math.max(0, this.graceMs),
    )
  }

  /** Cancel a running window — the connection recovered, or is closing. */
  cancel(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }
}
