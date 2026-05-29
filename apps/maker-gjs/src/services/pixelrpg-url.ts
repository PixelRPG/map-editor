/**
 * `pixelrpg://` URL scheme handling.
 *
 * The maker registers as `x-scheme-handler/pixelrpg` (via its
 * `.desktop` file MimeType entry, set up by the next phase of UI
 * work). When a browser / chat client opens a `pixelrpg://join/
 * <roomid>` URL, the OS spawns the maker with the URL as a CLI
 * argument; the entrypoint runs {@link parsePixelrpgUrl} over
 * `argv` to pluck out the join intent.
 *
 * Kept platform-indep (no `@girs/*` imports) so it's unit-testable
 * under Node.
 */

export type PixelrpgIntent = { kind: 'join'; roomId: string }

/**
 * Parse one URL string. Returns `null` for anything that isn't a
 * `pixelrpg://join/<roomid>` of the expected shape.
 */
export function parsePixelrpgUrl(url: string): PixelrpgIntent | null {
  if (!url.startsWith('pixelrpg://')) return null
  // Use a forgiving URL parse — the scheme isn't registered with the
  // WHATWG URL parser as "special", so the host parsing is a bit
  // quirky. Slice the scheme off and hand-split the rest.
  const tail = url.slice('pixelrpg://'.length)
  // Expected forms:
  //   join/<roomid>            (canonical)
  //   /join/<roomid>           (some launchers double the slash)
  const segments = tail.replace(/^\/+/, '').split(/[/?#]/).filter(Boolean)
  if (segments.length < 2) return null
  const [action, value] = segments
  if (action === 'join' && value && /^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    return { kind: 'join', roomId: value }
  }
  return null
}

/**
 * Build the canonical `pixelrpg://join/<roomid>` URL. Inverse of
 * {@link parsePixelrpgUrl} for the join form — used by the share
 * dialog to render the copy-and-paste link.
 *
 * Throws on a roomId that wouldn't survive a parse round-trip, so
 * callers don't accidentally publish a link that joiners can't
 * open.
 */
export function buildPixelrpgJoinUrl(roomId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(roomId)) {
    throw new Error(`buildPixelrpgJoinUrl: invalid roomId ${JSON.stringify(roomId)}`)
  }
  return `pixelrpg://join/${roomId}`
}

/**
 * Scan an argv array for the first valid `pixelrpg://` URL and
 * return the parsed intent, or `null` when nothing matches. Used by
 * `main.ts` on startup; the Application's `command-line` signal
 * uses the same helper to handle already-running second-instance
 * invocations.
 */
export function pickPixelrpgIntent(argv: readonly string[]): PixelrpgIntent | null {
  for (const arg of argv) {
    const intent = parsePixelrpgUrl(arg)
    if (intent) return intent
  }
  return null
}
