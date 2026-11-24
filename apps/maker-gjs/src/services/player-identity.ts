import GLib from '@girs/glib-2.0'
import type Gio from '@girs/gio-2.0'

/**
 * Who this installation is in a saved playthrough (GSettings key
 * `player-id`) — the key the engine files `players[id]` under.
 *
 * Generated once and kept, because a save is only worth keeping if the
 * person it belongs to can be found again: an id that changed per launch
 * would orphan every position it ever wrote. That is also why the peer
 * id of a shared session cannot serve here — `generatePeerId()` is new
 * every session by design. See `docs/concepts/save-record.md`.
 *
 * A fact about the person at the keyboard, like the view tier and the
 * collaborator colour: it follows them across projects, is never written
 * into a project, and is never sent to collaborators.
 *
 * Unlike `collab-name` and `collab-colour`, the default is *stored
 * rather than derived*: there is nothing in the system to derive a save
 * key from, and a value that cannot be recomputed must be written down
 * the first time it exists. Falls back to a session-only id with a
 * warning when the schema is unavailable, so an unpackaged build still
 * plays — its save simply does not outlive the run, which is already
 * true of every playtest.
 */
export function playerIdentity(settings: Gio.Settings | null): string {
  if (!settings) {
    console.warn('[playerIdentity] GSettings schema not found — this run gets a throwaway player id')
    return generatePlayerId()
  }
  const stored = settings.get_string('player-id')
  if (stored && stored.length > 0) return stored
  const fresh = generatePlayerId()
  settings.set_string('player-id', fresh)
  return fresh
}

/**
 * A new save key: `player-` plus a UUID.
 *
 * A UUID rather than the shorter random token `generatePeerId()` builds,
 * because two people whose records are merged into one world must not
 * collide, and a merge has no referee to break a tie with.
 */
export function generatePlayerId(): string {
  return `player-${GLib.uuid_string_random()}`
}
