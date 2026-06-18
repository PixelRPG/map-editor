import { describe, expect, it } from '@gjsify/unit'

import { PeerSession } from './peer-session.ts'
import { CHANNEL_AWARENESS, CHANNEL_OP, type SignallingMessage, type SignallingTransport } from './types.ts'

class InMemoryTransport implements SignallingTransport {
  public other: InMemoryTransport | null = null
  public closed = false
  private handler: ((message: SignallingMessage) => void) | null = null
  public readonly sent: SignallingMessage[] = []

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

class FakeDataChannel {
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
  deliver(payload: unknown): void {
    this.onmessage?.({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) })
  }
}

class FakeRTCPeerConnection {
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

function pair(): {
  hostTransport: InMemoryTransport
  joinerTransport: InMemoryTransport
} {
  const host = new InMemoryTransport()
  const joiner = new InMemoryTransport()
  host.other = joiner
  joiner.other = host
  return { hostTransport: host, joinerTransport: joiner }
}

function factoryFor(pc: FakeRTCPeerConnection): typeof RTCPeerConnection {
  // Regular function, not an arrow — PeerSession does `new factory(...)`
  // and arrows aren't constructable.
  // biome-ignore lint/complexity/useArrowFunction: must be `new`-able
  return function () {
    return pc
  } as unknown as typeof RTCPeerConnection
}

export default async () => {
  await describe('PeerSession', async () => {
    await it('host creates op + awareness channels with the documented reliability modes', async () => {
      const { hostTransport } = pair()
      const fakePc = new FakeRTCPeerConnection()
      const session = new PeerSession({
        role: 'host',
        signalling: hostTransport,
        rtcFactory: factoryFor(fakePc),
      })
      void session

      expect(fakePc.channels.map((c) => c.label).sort()).toStrictEqual([CHANNEL_AWARENESS, CHANNEL_OP])
    })

    await it('host emits SDP offer when connect() runs, forwards through signalling', async () => {
      const { hostTransport, joinerTransport } = pair()
      const fakePc = new FakeRTCPeerConnection()
      const session = new PeerSession({
        role: 'host',
        signalling: hostTransport,
        rtcFactory: factoryFor(fakePc),
      })

      await session.connect()
      await new Promise((r) => queueMicrotask(() => r(undefined)))

      expect(fakePc.localDescription?.type).toBe('offer')
      const firstSent = hostTransport.sent[0]
      expect(firstSent?.type).toBe('sdp')
      if (firstSent?.type === 'sdp') {
        expect(firstSent.payload.type).toBe('offer')
      }
      expect(joinerTransport.sent.length).toBe(0)
    })

    await it('joiner answers an incoming offer and forwards the SDP back', async () => {
      const { hostTransport, joinerTransport } = pair()
      const fakePc = new FakeRTCPeerConnection()
      const session = new PeerSession({
        role: 'joiner',
        signalling: joinerTransport,
        rtcFactory: factoryFor(fakePc),
      })
      await session.connect()

      hostTransport.send({ type: 'sdp', payload: { type: 'offer', sdp: 'fake-offer' } })
      await new Promise((r) => queueMicrotask(() => r(undefined)))
      await new Promise((r) => queueMicrotask(() => r(undefined)))

      expect(fakePc.remoteDescription?.type).toBe('offer')
      expect(fakePc.localDescription?.type).toBe('answer')
      const answer = joinerTransport.sent.find((m) => m.type === 'sdp' && m.payload.type === 'answer')
      expect(answer).toBeDefined()
    })

    await it('forwards local ICE candidates over signalling', async () => {
      const { hostTransport } = pair()
      const fakePc = new FakeRTCPeerConnection()
      const session = new PeerSession({
        role: 'host',
        signalling: hostTransport,
        rtcFactory: factoryFor(fakePc),
      })
      void session

      fakePc.fireIce({ candidate: 'a=fake', sdpMid: '0' })
      const last = hostTransport.sent.at(-1)
      expect(last?.type).toBe('ice-candidate')
      if (last?.type === 'ice-candidate') {
        expect((last.payload as { candidate: string }).candidate).toBe('a=fake')
      }
    })

    await it('buffers inbound ICE until the remote description is set, then drains in order', async () => {
      const { hostTransport, joinerTransport } = pair()
      const fakePc = new FakeRTCPeerConnection()
      const session = new PeerSession({
        role: 'host',
        signalling: hostTransport,
        rtcFactory: factoryFor(fakePc),
      })
      void session

      // Two candidates arrive BEFORE the SDP answer — must be buffered,
      // not applied (addIceCandidate before setRemoteDescription throws).
      joinerTransport.send({ type: 'ice-candidate', payload: { candidate: 'a=remote-1' } })
      joinerTransport.send({ type: 'ice-candidate', payload: { candidate: 'a=remote-2' } })
      await new Promise((r) => queueMicrotask(() => r(undefined)))
      await new Promise((r) => queueMicrotask(() => r(undefined)))
      expect(fakePc.addedIce).toStrictEqual([])

      // The SDP answer sets the remote description → buffered candidates drain in order.
      joinerTransport.send({ type: 'sdp', payload: { type: 'answer', sdp: 'fake-answer' } })
      await new Promise((r) => queueMicrotask(() => r(undefined)))
      await new Promise((r) => queueMicrotask(() => r(undefined)))
      expect(fakePc.remoteDescription?.type).toBe('answer')
      expect(fakePc.addedIce).toStrictEqual([{ candidate: 'a=remote-1' }, { candidate: 'a=remote-2' }])

      // A candidate that arrives AFTER the remote description is applied immediately.
      joinerTransport.send({ type: 'ice-candidate', payload: { candidate: 'a=remote-3' } })
      await new Promise((r) => queueMicrotask(() => r(undefined)))
      expect(fakePc.addedIce).toStrictEqual([
        { candidate: 'a=remote-1' },
        { candidate: 'a=remote-2' },
        { candidate: 'a=remote-3' },
      ])
    })

    await it('a transient disconnected within the grace window does not close the session', async () => {
      const { hostTransport } = pair()
      const fakePc = new FakeRTCPeerConnection()
      const session = new PeerSession({
        role: 'host',
        signalling: hostTransport,
        rtcFactory: factoryFor(fakePc),
        disconnectGraceMs: 10_000,
      })

      let closed = false
      session.events.on('closed', () => {
        closed = true
      })

      // ICE blip: disconnected → recovers to connected before the grace elapses.
      fakePc.connectionState = 'disconnected'
      fakePc.onconnectionstatechange?.()
      expect(closed).toBe(false)
      expect(session.getState()).not.toBe('closed')

      fakePc.connectionState = 'connected'
      fakePc.onconnectionstatechange?.()
      // Give any (incorrectly scheduled) timer a chance to fire.
      await new Promise((r) => setTimeout(r, 0))
      expect(closed).toBe(false)
      expect(session.getState()).not.toBe('closed')
    })

    await it('a disconnected state that persists past the grace window closes the session', async () => {
      const { hostTransport } = pair()
      const fakePc = new FakeRTCPeerConnection()
      const session = new PeerSession({
        role: 'host',
        signalling: hostTransport,
        rtcFactory: factoryFor(fakePc),
        disconnectGraceMs: 0,
      })

      let reason: string | undefined
      session.events.on('closed', ({ reason: r }) => {
        reason = r
      })

      fakePc.connectionState = 'disconnected'
      fakePc.onconnectionstatechange?.()
      // Grace is 0 → close fires on the next macrotask.
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      expect(session.getState()).toBe('closed')
      expect(reason).toBe('peer-disconnected')
    })

    await it('emits state-changed → connected once both channels open', async () => {
      const { hostTransport } = pair()
      const fakePc = new FakeRTCPeerConnection()
      const session = new PeerSession({
        role: 'host',
        signalling: hostTransport,
        rtcFactory: factoryFor(fakePc),
      })

      const states: string[] = []
      session.events.on('state-changed', ({ state }) => states.push(state))

      const op = fakePc.channels.find((c) => c.label === CHANNEL_OP)!
      const aw = fakePc.channels.find((c) => c.label === CHANNEL_AWARENESS)!

      op.open()
      expect(session.getState()).not.toBe('connected')
      aw.open()
      expect(session.getState()).toBe('connected')
      expect(states).toContain('connected')
    })

    await it('routes inbound channel messages to op-received vs awareness-received', async () => {
      const { hostTransport } = pair()
      const fakePc = new FakeRTCPeerConnection()
      const session = new PeerSession({
        role: 'host',
        signalling: hostTransport,
        rtcFactory: factoryFor(fakePc),
      })

      const ops: unknown[] = []
      const aware: unknown[] = []
      session.events.on('op-received', ({ op }) => ops.push(op))
      session.events.on('awareness-received', ({ data }) => aware.push(data))

      const opChan = fakePc.channels.find((c) => c.label === CHANNEL_OP)!
      const awChan = fakePc.channels.find((c) => c.label === CHANNEL_AWARENESS)!
      opChan.deliver({ kind: 'tile.paint', x: 1 })
      awChan.deliver({ kind: 'cursor', x: 12 })

      expect(ops).toStrictEqual([{ kind: 'tile.paint', x: 1 }])
      expect(aware).toStrictEqual([{ kind: 'cursor', x: 12 }])
    })

    await it('sendOp emits error when the op channel is not open', async () => {
      const { hostTransport } = pair()
      const fakePc = new FakeRTCPeerConnection()
      const session = new PeerSession({
        role: 'host',
        signalling: hostTransport,
        rtcFactory: factoryFor(fakePc),
      })

      const errors: Error[] = []
      session.events.on('error', ({ error }) => errors.push(error))
      session.sendOp({ kind: 'tile.paint' })
      expect(errors).toHaveLength(1)
      expect(errors[0]?.message).toMatch(/op channel not open/)
    })

    await it('sendAwareness silently drops when the channel is not open', async () => {
      const { hostTransport } = pair()
      const fakePc = new FakeRTCPeerConnection()
      const session = new PeerSession({
        role: 'host',
        signalling: hostTransport,
        rtcFactory: factoryFor(fakePc),
      })

      const errors: Error[] = []
      session.events.on('error', ({ error }) => errors.push(error))
      session.sendAwareness({ x: 0, y: 0 })
      expect(errors).toStrictEqual([])
    })

    await it('close() sends bye + tears down idempotently', async () => {
      const { hostTransport } = pair()
      const fakePc = new FakeRTCPeerConnection()
      const session = new PeerSession({
        role: 'host',
        signalling: hostTransport,
        rtcFactory: factoryFor(fakePc),
      })

      let closedCount = 0
      session.events.on('closed', () => closedCount++)
      session.close('test')
      session.close('test') // idempotent

      const bye = hostTransport.sent.find((m) => m.type === 'bye')
      expect(bye?.type).toBe('bye')
      if (bye?.type === 'bye') {
        expect(bye.payload?.reason).toBe('test')
      }
      expect(fakePc.connectionState).toBe('closed')
      expect(hostTransport.closed).toBe(true)
      expect(closedCount).toBe(1)
      expect(session.getState()).toBe('closed')
    })

    await it('joiner attaches to incoming channels via ondatachannel', async () => {
      const { joinerTransport } = pair()
      const fakePc = new FakeRTCPeerConnection()
      const session = new PeerSession({
        role: 'joiner',
        signalling: joinerTransport,
        rtcFactory: factoryFor(fakePc),
      })

      expect(fakePc.channels).toStrictEqual([])

      const op = fakePc.simulateIncomingChannel(CHANNEL_OP)
      const aw = fakePc.simulateIncomingChannel(CHANNEL_AWARENESS)
      op.open()
      aw.open()
      expect(session.getState()).toBe('connected')
    })
  })
}
