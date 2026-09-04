import type { PeerRole } from './types.ts'

/**
 * Diagnostic-logging gate for the WebRTC layer. Set
 * `globalThis.__PIXELRPG_PEER_DEBUG` to a truthy value to enable
 * verbose `[peer-session]` logs (SDP exchange, ICE candidate flow,
 * channel + state transitions).
 *
 * Off by default so production logs stay readable. The pair-edit
 * hand-test workflow flips it on:
 *
 *   globalThis.__PIXELRPG_PEER_DEBUG = true
 *
 * before constructing the session, or sets it in `main.ts` behind a
 * `PIXELRPG_DEBUG_PEER` env var. Deliberately below the scoped-logger
 * machinery in `@pixelrpg/maker-gjs`, because the engine is
 * platform-independent (no maker imports allowed).
 */
export function isPeerDebugEnabled(): boolean {
  return Boolean((globalThis as { __PIXELRPG_PEER_DEBUG?: unknown }).__PIXELRPG_PEER_DEBUG)
}

/** Log a role-tagged peer-session line when peer debugging is on. */
export function peerLog(role: PeerRole, message: string): void {
  if (isPeerDebugEnabled()) {
    console.log(`[peer-session/${role}] ${message}`)
  }
}
