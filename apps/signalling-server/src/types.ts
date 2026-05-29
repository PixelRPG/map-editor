/**
 * Wire protocol between a PixelRPG peer and the signalling relay.
 *
 * The relay never inspects payloads beyond the discriminator —
 * SDP and ICE-candidate descriptions are opaque blobs forwarded
 * to the other peer in the room. WebRTC's DTLS layer provides the
 * end-to-end confidentiality; the relay is intentionally dumb.
 */
export type SignallingMessage =
  | { type: 'sdp'; payload: unknown }
  | { type: 'ice-candidate'; payload: unknown }
  | { type: 'bye'; payload?: { reason?: string } }

/** Role a connected peer plays inside a room. Enforced by query string. */
export type PeerRole = 'host' | 'joiner'

/**
 * Minimal peer abstraction the {@link RoomManager} consumes. Lets
 * the routing logic stay pure data — production code wraps a
 * `ws.WebSocket`, unit tests pass a stub.
 */
export interface SignallingPeer {
  /** Send a wire frame to this peer. */
  send(frame: string): void
  /** Close the peer's underlying socket. */
  close(): void
}
