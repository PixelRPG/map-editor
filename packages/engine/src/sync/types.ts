/**
 * Sync layer — types shared between {@link PeerSession}, the
 * platform-specific signalling transports
 * (`apps/maker-gjs/src/services/{lan-discovery,signalling-relay}.ts`)
 * and the host-side op-log glue.
 *
 * Everything in this module is platform-indep: the engine sync
 * layer must run identically under GJS (maker) and the browser
 * (game-browser), so no `gi://*` / `@girs/*` value imports are
 * allowed here.
 */

/** Role a peer plays in a session. */
export type PeerRole = 'host' | 'joiner'

/**
 * Wire envelope the {@link SignallingTransport} carries between
 * peers. Mirrors the relay's `SignallingMessage` so both sides of
 * the negotiation speak the same dialect, regardless of whether
 * the transport is the WS relay or a future LAN-direct channel.
 */
export type SignallingMessage =
  | { type: 'sdp'; payload: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; payload: RTCIceCandidateInit | null }
  | { type: 'bye'; payload?: { reason?: string } }

/**
 * Minimal duplex contract between {@link PeerSession} and its
 * signalling backend. The backend is responsible for delivering
 * each frame to the OTHER peer in the session, in order; reliability
 * is a soft promise — `PeerSession` retries SDP negotiation on
 * connection failure, so a dropped frame on the signalling layer
 * is recoverable.
 *
 * Three implementations live downstream:
 *
 *  - `RelayTransport` — WebSocket to `@pixelrpg/signalling-server`
 *  - `LanDirectTransport` — HTTP POST to the host's Avahi-published
 *    local endpoint
 *  - `InMemoryTransport` — used in unit tests to bridge two
 *    `PeerSession` instances without a real socket
 */
export interface SignallingTransport {
  send(message: SignallingMessage): void
  /** Register the inbound handler. Called at most once. */
  onMessage(handler: (message: SignallingMessage) => void): void
  /** Close the underlying socket / connection. Idempotent. */
  close(): void
}

/**
 * Subset of the W3C `RTCPeerConnection` constructor signature we
 * actually use. Injected so unit tests can pass a fake; production
 * code resolves the global at `PeerSession` construction.
 */
export type RTCPeerConnectionFactory = new (config?: RTCConfiguration) => RTCPeerConnection

/**
 * Peer-session opening state. Drives UI ("connecting…", "connected",
 * "disconnected") and gates op + awareness emits — a half-open
 * session must buffer or drop, never `throw`.
 */
export type PeerSessionState = 'idle' | 'negotiating' | 'connected' | 'closed' | 'error'

/**
 * Typed events `PeerSession` emits via its EventEmitter. Consumers
 * (op-log broadcaster, awareness layer, UI) listen here rather than
 * touching the RTCPeerConnection directly.
 */
export interface PeerSessionEventMap {
  /** Emitted when both reliable + unreliable channels are open. */
  'state-changed': { state: PeerSessionState }
  /** Reliable channel delivered a frame. Payload is the inner op. */
  'op-received': { op: unknown }
  /** Unreliable channel delivered a frame. Payload is the awareness data. */
  'awareness-received': { data: unknown }
  /** Connection closed for any reason — clean shutdown, peer drop, ICE failure. */
  'closed': { reason: string }
  /** Recoverable error — caller decides whether to retry / surface to UI. */
  'error': { error: Error }
}

/**
 * Default ICE-server configuration. Single public STUN server is
 * sufficient for cross-internet connectivity behind most NATs
 * without a relay; symmetric / carrier-grade NATs that need TURN
 * are out of v1 scope (the signalling-server doc § "Open questions"
 * tracks adding a TURN allowlist later).
 */
export const DEFAULT_ICE_SERVERS: readonly RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302'] },
] as const

/**
 * Channel labels — `op` is reliable+ordered (mutations must arrive
 * + apply in order), `awareness` is unreliable+unordered (latest-
 * wins cursor / presence; missing one update is fine).
 */
export const CHANNEL_OP = 'op'
export const CHANNEL_AWARENESS = 'awareness'
