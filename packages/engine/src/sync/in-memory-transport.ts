/**
 * In-memory test doubles for the sync layer.
 *
 * Re-usable across every spec / integration test that needs to
 * exercise `PeerSession`, `CollabSession`, or the higher-level
 * snapshot + awareness flows WITHOUT a real WebRTC / WebSocket /
 * Avahi stack. Originally inlined in `peer-session.spec.ts`;
 * extracted here so the maker's integration tests (and any future
 * cross-package suites) can drive the same fixtures.
 *
 * Three building blocks:
 *
 *   - {@link InMemoryTransport} — pairs with another instance and
 *     delivers signalling frames via `queueMicrotask` so the
 *     async ordering matches a real socket.
 *   - {@link FakeDataChannel} — mirrors the W3C `RTCDataChannel`
 *     surface PeerSession actually touches. `open()` /
 *     `deliver(payload)` are test-only hooks.
 *   - {@link FakeRTCPeerConnection} — mirrors the W3C
 *     `RTCPeerConnection` surface PeerSession actually touches.
 *     `simulateIncomingChannel(label)` + `fireIce(candidate)` are
 *     test-only hooks for the joiner side of the handshake.
 *
 * Three helpers:
 *
 *   - {@link makeTransportPair} — creates two paired
 *     {@link InMemoryTransport} instances.
 *   - {@link rtcFactoryFor} — wraps a {@link FakeRTCPeerConnection}
 *     in the `typeof RTCPeerConnection` shape PeerSession's
 *     options expect.
 *   - {@link createConnectedSessionPair} — full handshake harness:
 *     constructs two `PeerSession` instances, drives the
 *     SDP/ICE exchange, opens both channels, resolves once both
 *     ends are in `connected` state. The convenience layer most
 *     integration tests want.
 *
 * Why a regular `.ts` file in `sync/` instead of inlining the
 * doubles into `peer-session.spec.ts` (where they originally
 * lived)? The doubles are used by tests in OTHER packages
 * (`maker-gjs` integration suite) — keeping them in a peer-
 * session spec would have hidden them behind that spec's
 * bundle. A regular `.ts` export goes through the public
 * package surface (re-exported from
 * `packages/engine/src/sync/index.ts`) so consumers can
 * `import { makeTransportPair } from '@pixelrpg/engine'`.
 *
 * The fakes ship in the normal package surface (they are not
 * gated behind a separate subpath). For an internal-only
 * workspace package this is fine; if the engine ever becomes a
 * published npm package, move these into a dedicated
 * `@pixelrpg/engine/testing` subpath export.
 */

import { PeerSession } from './peer-session.ts'
import { CHANNEL_AWARENESS, CHANNEL_OP, type SignallingMessage, type SignallingTransport } from './types.ts'

/**
 * `SignallingTransport` implementation that delivers each frame
 * to its `other` peer via `queueMicrotask`. Asynchrony matches a
 * real socket (handler fires AFTER `send` returns); same-tick
 * synchronous delivery would mask ordering bugs in the consumer.
 */
export class InMemoryTransport implements SignallingTransport {
  /** Pair partner. `null` means messages disappear into the void. */
  public other: InMemoryTransport | null = null
  /** `close()` flag — exposed for assertions, not enforced on send. */
  public closed = false
  /** Every frame this transport observed via `send`. */
  public readonly sent: SignallingMessage[] = []

  private handler: ((message: SignallingMessage) => void) | null = null

  send(message: SignallingMessage): void {
    this.sent.push(message)
    queueMicrotask(() => this.other?.handler?.(message))
  }

  onMessage(handler: (message: SignallingMessage) => void): void {
    this.handler = handler
  }

  close(): void {
    this.closed = true
  }
}

/**
 * Mirrors the subset of `RTCDataChannel` PeerSession touches.
 * Test code calls `open()` to flip into the open state and
 * `deliver(payload)` to simulate inbound frames.
 */
export class FakeDataChannel {
  public readyState: RTCDataChannelState = 'connecting'
  public sentFrames: string[] = []
  public onopen: (() => void) | null = null
  public onclose: (() => void) | null = null
  public onerror: ((ev: unknown) => void) | null = null
  public onmessage: ((ev: { data: unknown }) => void) | null = null

  constructor(public readonly label: string) {}

  open(): void {
    this.readyState = 'open'
    this.onopen?.()
  }

  send(frame: string): void {
    this.sentFrames.push(frame)
  }

  close(): void {
    this.readyState = 'closed'
    this.onclose?.()
  }

  /** Simulate an inbound frame. Tests call this to feed the peer's response. */
  deliver(payload: unknown): void {
    this.onmessage?.({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) })
  }
}

/**
 * Mirrors the subset of `RTCPeerConnection` PeerSession touches.
 *
 * `createOffer` / `createAnswer` return canned SDPs; tests that
 * care about real SDP shape would substitute another fake. ICE
 * candidates are recorded but never auto-fired — tests call
 * `fireIce` explicitly so the timing is deterministic.
 *
 * `simulateIncomingChannel(label)` is the test-only hook for the
 * joiner side: PeerSession's joiner role waits for the host to
 * `createDataChannel`, which the host's RTCPeerConnection
 * normally surfaces via `ondatachannel` on the OTHER end. This
 * helper synthesises that.
 */
export class FakeRTCPeerConnection {
  public connectionState: RTCPeerConnectionState = 'new'
  public ondatachannel: ((event: { channel: FakeDataChannel }) => void) | null = null
  public onicecandidate: ((event: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null = null
  public onconnectionstatechange: (() => void) | null = null
  public localDescription: RTCSessionDescriptionInit | null = null
  public remoteDescription: RTCSessionDescriptionInit | null = null
  public readonly addedIce: RTCIceCandidateInit[] = []
  public readonly channels: FakeDataChannel[] = []

  constructor(public readonly config?: RTCConfiguration) {}

  createDataChannel(label: string, _opts?: RTCDataChannelInit): FakeDataChannel {
    const c = new FakeDataChannel(label)
    this.channels.push(c)
    return c
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: `offer-sdp:${this.config?.iceServers?.[0]?.urls ?? '?'}` }
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'answer-sdp' }
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc
  }

  async addIceCandidate(c: RTCIceCandidateInit): Promise<void> {
    this.addedIce.push(c)
  }

  close(): void {
    this.connectionState = 'closed'
    this.onconnectionstatechange?.()
  }

  simulateIncomingChannel(label: string): FakeDataChannel {
    const c = new FakeDataChannel(label)
    this.channels.push(c)
    this.ondatachannel?.({ channel: c })
    return c
  }

  fireIce(candidate: RTCIceCandidateInit | null): void {
    this.onicecandidate?.({ candidate: candidate ? { toJSON: () => candidate } : null })
  }
}

/** Two paired {@link InMemoryTransport} instances ready to wire into PeerSession. */
export function makeTransportPair(): {
  hostTransport: InMemoryTransport
  joinerTransport: InMemoryTransport
} {
  const host = new InMemoryTransport()
  const joiner = new InMemoryTransport()
  host.other = joiner
  joiner.other = host
  return { hostTransport: host, joinerTransport: joiner }
}

/** Wrap a {@link FakeRTCPeerConnection} as the `typeof RTCPeerConnection` PeerSession options expect. */
export function rtcFactoryFor(pc: FakeRTCPeerConnection): typeof RTCPeerConnection {
  return (() => pc) as unknown as typeof RTCPeerConnection
}

/**
 * Flush queued microtasks. Two passes are deliberate: PeerSession
 * + CollabSession layers each queue follow-up work via
 * `queueMicrotask`, so a single `Promise.resolve()` would only
 * advance the first layer. Two passes covers the SDP-exchange +
 * channel-wiring depth without over-flushing.
 */
export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * Cross-wire two {@link FakeDataChannel} instances so that calling
 * `.send(frame)` on one delivers to the other's `onmessage` (via
 * `queueMicrotask`, matching real channel async semantics).
 *
 * Idempotent: a second wire-up is a no-op. The base
 * `FakeDataChannel.send` only appends to `sentFrames`; this hook
 * is what makes the symmetric end actually observe inbound data.
 */
export function wireChannelDelivery(a: FakeDataChannel, b: FakeDataChannel): void {
  const aSend = a.send.bind(a)
  const bSend = b.send.bind(b)
  a.send = (frame: string) => {
    aSend(frame)
    queueMicrotask(() => b.deliver(frame))
  }
  b.send = (frame: string) => {
    bSend(frame)
    queueMicrotask(() => a.deliver(frame))
  }
}

export interface ConnectedSessionPair {
  host: PeerSession
  joiner: PeerSession
  hostTransport: InMemoryTransport
  joinerTransport: InMemoryTransport
  hostPc: FakeRTCPeerConnection
  joinerPc: FakeRTCPeerConnection
  /** Op channel the host wired into the offer. Tests use it to assert / deliver frames. */
  hostOpChannel: FakeDataChannel
  /** Awareness channel the host wired into the offer. */
  hostAwarenessChannel: FakeDataChannel
  /** Op channel the joiner's RTCPeerConnection surfaced via `ondatachannel`. */
  joinerOpChannel: FakeDataChannel
  /** Awareness channel the joiner's RTCPeerConnection surfaced via `ondatachannel`. */
  joinerAwarenessChannel: FakeDataChannel
  /** Tear down both sessions + the transport pair. Idempotent. */
  close: () => void
}

/**
 * Full handshake harness — constructs two `PeerSession` instances,
 * drives the SDP/ICE exchange, opens both channels, and resolves
 * once both ends are in `connected` state.
 *
 * Use this in integration tests that don't care about handshake
 * details — they just want two sessions ready to exchange ops +
 * awareness. The lower-level fakes (above) stay available for
 * tests that DO want to exercise handshake edge cases.
 *
 * The op + awareness channels are exposed on the returned object
 * so tests can:
 *   - Assert outbound frames: `pair.hostOpChannel.sentFrames`
 *   - Deliver inbound frames: `pair.joinerOpChannel.deliver(...)`
 *   - Trigger close: `pair.hostOpChannel.close()`
 *
 * Implementation notes:
 *   - Both sessions are wired BEFORE `connect()` is called so no
 *     SDP frame races the handler attachment.
 *   - The host calls `connect()` first (host role drives offer);
 *     joiner's `connect()` runs concurrently — both promises
 *     `await Promise.all`-ed.
 *   - Each PeerSession's `state-changed` event is awaited until
 *     `'connected'` fires.
 */
export async function createConnectedSessionPair(): Promise<ConnectedSessionPair> {
  const { hostTransport, joinerTransport } = makeTransportPair()
  const hostPc = new FakeRTCPeerConnection()
  const joinerPc = new FakeRTCPeerConnection()

  const host = new PeerSession({
    role: 'host',
    signalling: hostTransport,
    rtcFactory: rtcFactoryFor(hostPc),
  })
  const joiner = new PeerSession({
    role: 'joiner',
    signalling: joinerTransport,
    rtcFactory: rtcFactoryFor(joinerPc),
  })

  // Drive the handshake: both sessions concurrently. PeerSession
  // resolves `connect()` once ICE gathering kicks off; channel-
  // open events follow separately.
  await Promise.all([host.connect(), joiner.connect()])
  // Flush the microtask queue so the joiner has actually
  // processed the host's queued SDP offer.
  await flushMicrotasks()

  // Host created the channels in its createDataChannel calls;
  // they're already in hostPc.channels. Joiner's side hasn't
  // seen them yet — simulate ondatachannel for both labels so
  // the joiner side wires its handlers.
  const hostOpChannel = hostPc.channels.find((c) => c.label === CHANNEL_OP)
  const hostAwarenessChannel = hostPc.channels.find((c) => c.label === CHANNEL_AWARENESS)
  if (!hostOpChannel || !hostAwarenessChannel) {
    throw new Error('createConnectedSessionPair: host did not create the expected channels')
  }
  const joinerOpChannel = joinerPc.simulateIncomingChannel(CHANNEL_OP)
  const joinerAwarenessChannel = joinerPc.simulateIncomingChannel(CHANNEL_AWARENESS)

  // Cross-wire send → deliver so a real op / awareness frame
  // sent on one peer's channel automatically materialises on the
  // other peer's channel. Without this, every test would have to
  // do `host.sendOp(...)` + `joinerOpChannel.deliver(...)`
  // manually for every frame.
  wireChannelDelivery(hostOpChannel, joinerOpChannel)
  wireChannelDelivery(hostAwarenessChannel, joinerAwarenessChannel)

  // Open all four channels — PeerSession transitions to `connected`
  // when BOTH its own op + awareness channels are open.
  hostOpChannel.open()
  hostAwarenessChannel.open()
  joinerOpChannel.open()
  joinerAwarenessChannel.open()

  // Flush microtasks so state-changed listeners run.
  await flushMicrotasks()

  const close = (): void => {
    try {
      host.close('test-teardown')
    } catch {
      /* already closed */
    }
    try {
      joiner.close('test-teardown')
    } catch {
      /* already closed */
    }
  }

  return {
    host,
    joiner,
    hostTransport,
    joinerTransport,
    hostPc,
    joinerPc,
    hostOpChannel,
    hostAwarenessChannel,
    joinerOpChannel,
    joinerAwarenessChannel,
    close,
  }
}
