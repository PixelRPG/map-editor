import type { SessionState } from './session-state.ts'

/**
 * What the connection banner says (REDESIGN.md § 4.7). `none` hides it:
 * an idle, browsing or hosting-and-waiting session is not a connection
 * problem, and Together's own dialog already narrates the handshake.
 */
export type ConnectionIndicator = 'none' | 'connecting' | 'reconnecting'

/**
 * `reconnecting` is the transient ICE blip on a session that WAS live;
 * `connecting` is the joiner still negotiating. A blip outranks nothing
 * but a live session, so it is ignored in every other state.
 */
export function connectionIndicator(state: SessionState, linkReconnecting: boolean): ConnectionIndicator {
  switch (state.kind) {
    case 'connecting':
      return 'connecting'
    case 'awaiting-engine':
    case 'connected':
      return linkReconnecting ? 'reconnecting' : 'none'
    default:
      return 'none'
  }
}
