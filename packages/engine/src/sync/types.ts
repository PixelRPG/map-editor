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
 * Default ICE-server configuration — **empty by design**.
 *
 * Pair-Editing v1 is LAN-only: host + joiner are on the same
 * local network (same machine via `dbus-run-session`, or two
 * machines reached over Avahi). For that topology, **host ICE
 * candidates alone are sufficient** — both peers see each other
 * as 127.0.0.1 / 192.168.x.x without ever needing a reflexive
 * (`srflx`) candidate from STUN.
 *
 * The cost of configuring a STUN server when we don't need one
 * is high: setting `stun_server` on GStreamer's `webrtcbin` makes
 * libnice (the underlying ICE library) initialise its full NAT-
 * traversal pipeline, which includes **UPnP IGD discovery** via
 * gupnp-control-point. If the router doesn't respond promptly to
 * `GET <ip>:49000/igddesc.xml` (~10 s typical) the joiner-side
 * `state === 'connected'` transition is delayed past
 * {@link CollabSession}'s 15 s timeout. The 2026-05-30 hand-test
 * regression was exactly this — both peers timed out at 15 s with
 * gupnp-control-point WARNINGS retrying the IGD fetch in the
 * background.
 *
 * Empty array → libnice short-circuits UPnP/STUN/TURN entirely,
 * ICE gathering completes with host candidates in ~50 ms,
 * peer connection reaches `connected` immediately.
 *
 * **For cross-internet sessions (post-v1)** the caller will pass
 * `iceServers` explicitly via {@link PeerSessionOptions.iceServers}
 * — most likely fetched from the signalling server's room-config
 * endpoint so the STUN / TURN credentials can be rotated without
 * a client-side rebuild.
 */
export const DEFAULT_ICE_SERVERS: readonly RTCIceServer[] = [] as const

/**
 * Channel labels — `op` is reliable+ordered (mutations must arrive
 * + apply in order), `awareness` is unreliable+unordered (latest-
 * wins cursor / presence; missing one update is fine).
 */
export const CHANNEL_OP = 'op'
export const CHANNEL_AWARENESS = 'awareness'
