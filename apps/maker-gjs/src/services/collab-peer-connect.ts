import type { PeerSessionState } from '@pixelrpg/engine'

/**
 * Default deadline for the WebRTC handshake — from the moment
 * `peer.connect()` is called to the moment both data channels open
 * and the peer's state transitions to `'connected'`. Generous to
 * accommodate slow ICE on busy networks, but short enough to fail
 * fast on a misconfigured relay or a network-unreachable peer.
 *
 * Pre-2026-05-30 there was no deadline here at all. The joiner-side
 * `collab.start()` would resolve as soon as ICE GATHERING started
 * (PeerSession's `connect()` contract) and `requestSnapshot()` would
 * await the host's response — which never arrived if the actual SDP
 * round-trip silently failed. Symptom: "joiner WS connects but
 * nothing else happens." Now: the joiner times out after 15s with
 * a typed CollabTimeoutError naming the unmet condition.
 */
export const PEER_CONNECT_TIMEOUT_MS = 15_000

/** Subscribe `listener` to peer state transitions; returns the unsubscribe closure. */
export type PeerStateSubscribe = (listener: (state: PeerSessionState) => void) => () => void

/**
 * Resolve once the peer state is `'connected'`; reject on any terminal
 * state (`'closed'`, `'error'`).
 *
 * Gating on the actual handshake completion rather than
 * ICE-gather-started is what keeps callers from sending traffic on
 * still-closed data channels: `PeerSession.connect()` resolves once ICE
 * gathering kicks off — almost immediately for the host, instantly for
 * the joiner (whose role is to wait for the host's offer).
 */
export function waitForPeerConnected(getState: () => PeerSessionState, subscribe: PeerStateSubscribe): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const current = getState()
    if (current === 'connected') {
      resolve()
      return
    }
    if (current === 'closed' || current === 'error') {
      reject(new Error(`CollabSession: peer is already "${current}"`))
      return
    }
    const unsubscribe = subscribe((state) => {
      if (state === 'connected') {
        unsubscribe()
        resolve()
      } else if (state === 'closed' || state === 'error') {
        unsubscribe()
        reject(new Error(`CollabSession: peer transitioned to "${state}" before connect`))
      }
    })
  })
}
