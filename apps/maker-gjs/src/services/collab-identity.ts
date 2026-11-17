import { PEER_COLOURS } from './collab-peer-colour.ts'

/**
 * The identity a user hands to everyone else in a session: the name on
 * their roster row and the colour of their cursor (REDESIGN.md § 4.8,
 * group *Together*).
 *
 * Until step 8.1 both were derived: the name was the Unix login and the
 * colour was `colourForPeer(peerId)`, a hash every participant computed
 * for itself. A *chosen* colour cannot be derived, so it travels on the
 * wire in `AwarenessPeerInfo.color` — which the presence protocol has
 * always carried; nothing used to write anything but the hash into it.
 *
 * gi-free so the coercions are unit-testable: these values come out of
 * GSettings and off the network, and a bogus one must degrade to
 * something renderable rather than paint an invisible cursor.
 */

/** The colours offered in Preferences — the peer palette, in order. */
export const COLLAB_COLOURS = PEER_COLOURS

/** Longest display name we store. Long enough for a real name, short enough for a roster row. */
export const MAX_DISPLAY_NAME = 32

/**
 * Clamp a name to something a roster row can show. Collapses runs of
 * whitespace (a pasted name with a newline in it would otherwise break
 * the row layout) and truncates rather than refusing — a user typing
 * past the limit should not lose the keystroke.
 */
export function coerceDisplayName(raw: string, fallback: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (!collapsed) return fallback
  return [...collapsed].slice(0, MAX_DISPLAY_NAME).join('')
}

/**
 * Accept a stored or received colour only if it is one of ours.
 *
 * Deliberately a whitelist and not a `#rrggbb` regex: the palette is
 * what keeps peers distinguishable and the AI's purple unused, and a
 * free-form colour from a peer could be the canvas background. An
 * unknown value falls back to the peerId hash, which is what every
 * build before 8.1 would have shown.
 */
export function coerceCollabColour(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback
  const lower = raw.toLowerCase()
  return (COLLAB_COLOURS as readonly string[]).includes(lower) ? lower : fallback
}

/**
 * The name to start from when the user has never chosen one: their real
 * name if the system knows it, else their login, else "You".
 *
 * `GLib.get_real_name()` returns the literal string `"Unknown"` when
 * GECOS is empty — a documented sentinel, not a name, so it is filtered
 * here rather than ending up as somebody's roster row.
 */
export function defaultDisplayName(realName: string | null, userName: string | null, fallback: string): string {
  const real = realName?.trim()
  if (real && real !== 'Unknown') return coerceDisplayName(real, fallback)
  const user = userName?.trim()
  if (user) return coerceDisplayName(user, fallback)
  return fallback
}
