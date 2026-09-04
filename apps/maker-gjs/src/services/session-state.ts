import type { PeerRole } from '@pixelrpg/engine'

import type { CollabSession } from './collab-session.ts'

export type SessionState =
  | { kind: 'idle' }
  | { kind: 'browsing' }
  | { kind: 'hosting'; roomId: string; port: number }
  | { kind: 'connecting' }
  /**
   * Joiner-only: the peer connection is up, the snapshot has been
   * pulled + written to `sandboxProjectPath`, but the engine is
   * not yet attached. The caller (ApplicationWindow) is expected
   * to load the project at `sandboxProjectPath` and then call
   * `attachEngineToCurrentSession(engine)` — at which point the
   * state transitions to `connected`.
   */
  | {
      kind: 'awaiting-engine'
      role: PeerRole
      roomId: string
      collab: CollabSession
      sandboxProjectPath: string
    }
  | { kind: 'connected'; role: PeerRole; roomId: string; collab: CollabSession }

/** The two arms that carry a live {@link CollabSession}. */
export type LiveSessionState = Extract<SessionState, { collab: CollabSession }>

/**
 * A join would replace a session that is already being established or
 * running. `hosting` is deliberately absent: a host may join elsewhere
 * after tearing its own room down, and `startBrowsing`/`idle` obviously
 * allow it.
 */
const JOIN_BLOCKING: readonly SessionState['kind'][] = ['connecting', 'awaiting-engine', 'connected']

/** Hosting is refused while any session is live — one session per maker. */
const HOSTING_BLOCKING: readonly SessionState['kind'][] = ['connected', 'connecting', 'hosting']

export function blocksJoin(kind: SessionState['kind']): boolean {
  return JOIN_BLOCKING.includes(kind)
}

export function blocksHosting(kind: SessionState['kind']): boolean {
  return HOSTING_BLOCKING.includes(kind)
}

/** Whether the state carries a `collab` to close / compare against. */
export function hasLiveCollab(state: SessionState): state is LiveSessionState {
  return state.kind === 'connected' || state.kind === 'awaiting-engine'
}

/**
 * Where to land after a session ends or fails: back to `browsing` if
 * the welcome view was browsing when the session started, else `idle`.
 */
export function preSessionState(wasBrowsing: boolean): SessionState {
  return wasBrowsing ? { kind: 'browsing' } : { kind: 'idle' }
}
