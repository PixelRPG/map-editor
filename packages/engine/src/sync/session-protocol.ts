/**
 * Session-protocol message kinds — messages that travel on the
 * reliable op channel but are NOT commands (no engine state
 * mutation). The `__session/` prefix is the discriminator the
 * SessionController uses to filter them out before dispatching
 * to the command registry.
 *
 * Keeping these on the existing op channel (instead of a third
 * data channel) is the simple-wins-over-pure approach: there's
 * little protocol traffic at peak, the messages need reliable
 * + ordered delivery anyway (same as commands), and adding a
 * channel costs SDP/ICE/wire/code surface.
 *
 * Naming convention:
 *   - `__session/snapshot-request` — joiner asks host for its
 *     current project state. Payload: `{ roomId }` for tagging.
 *   - `__session/snapshot-response` — host's reply. Payload:
 *     `{ snapshot: ProjectSnapshot }` (the wire-serialised form).
 *
 * The `__` prefix matches the existing internal-prefix idiom in
 * the codebase (`__GJSIFY_DEBUG_*` etc.). Future session-control
 * kinds (e.g. `__session/leave-broadcast`, `__session/role-
 * migrate`) share the same prefix.
 */

import type { ProjectSnapshot } from './project-snapshot.ts'

export const SESSION_PROTOCOL_PREFIX = '__session/'
export const SNAPSHOT_REQUEST_KIND = '__session/snapshot-request'
export const SNAPSHOT_RESPONSE_KIND = '__session/snapshot-response'

/** Joiner → host: "send me your current project state". */
export interface SnapshotRequestOp {
  kind: typeof SNAPSHOT_REQUEST_KIND
  payload: { roomId: string }
  peerId: string
  /** Per-peer monotonic sequence. Same shape as a normal Operation. */
  seq: number
}

/** Host → joiner: project state for the requesting room. */
export interface SnapshotResponseOp {
  kind: typeof SNAPSHOT_RESPONSE_KIND
  payload: { snapshot: ProjectSnapshot }
  peerId: string
  seq: number
}

export type SessionProtocolOp = SnapshotRequestOp | SnapshotResponseOp

/**
 * Discriminator: is this raw op a session-protocol message that
 * the SessionController should route AROUND the command registry?
 * Other op kinds (`tile.paint`, `placement.add`, etc.) return
 * false and proceed through the normal command path.
 */
export function isSessionProtocolOp(rawOp: unknown): rawOp is SessionProtocolOp {
  if (!rawOp || typeof rawOp !== 'object') return false
  const k = (rawOp as { kind?: unknown }).kind
  return typeof k === 'string' && k.startsWith(SESSION_PROTOCOL_PREFIX)
}

/**
 * Build a snapshot-request envelope. Helper instead of literal
 * object so the type discriminator stays exact + the kind string
 * is single-source-of-truth.
 */
export function createSnapshotRequestOp(args: {
  peerId: string
  seq: number
  roomId: string
}): SnapshotRequestOp {
  return {
    kind: SNAPSHOT_REQUEST_KIND,
    payload: { roomId: args.roomId },
    peerId: args.peerId,
    seq: args.seq,
  }
}

/** Build a snapshot-response envelope wrapping a captured ProjectSnapshot. */
export function createSnapshotResponseOp(args: {
  peerId: string
  seq: number
  snapshot: ProjectSnapshot
}): SnapshotResponseOp {
  return {
    kind: SNAPSHOT_RESPONSE_KIND,
    payload: { snapshot: args.snapshot },
    peerId: args.peerId,
    seq: args.seq,
  }
}
