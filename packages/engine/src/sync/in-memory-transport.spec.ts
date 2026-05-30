import { describe, expect, it } from '@gjsify/unit'

import {
  type ConnectedSessionPair,
  createConnectedSessionPair,
  FakeDataChannel,
  FakeRTCPeerConnection,
  flushMicrotasks,
  InMemoryTransport,
  makeTransportPair,
  rtcFactoryFor,
  wireChannelDelivery,
} from './in-memory-transport.ts'

export default async () => {
  await describe('InMemoryTransport + makeTransportPair', async () => {
    await it('delivers frames to the paired peer asynchronously', async () => {
      const { hostTransport, joinerTransport } = makeTransportPair()
      const received: unknown[] = []
      joinerTransport.onMessage((m) => received.push(m))

      hostTransport.send({ type: 'sdp', payload: { type: 'offer', sdp: 'x' } })
      // Synchronous: no delivery yet.
      expect(received.length).toBe(0)
      await flushMicrotasks()
      // Delivered via queueMicrotask.
      expect(received.length).toBe(1)
    })

    await it('records sent frames on the sender side', async () => {
      const { hostTransport } = makeTransportPair()
      hostTransport.send({ type: 'bye' })
      expect(hostTransport.sent.length).toBe(1)
      expect(hostTransport.sent[0]).toStrictEqual({ type: 'bye' })
    })

    await it('close() is observable but does not block sends', async () => {
      const { hostTransport, joinerTransport } = makeTransportPair()
      hostTransport.close()
      expect(hostTransport.closed).toBe(true)
      // Real transports may also drop post-close sends; the in-memory
      // fake does not — this is by design so misbehaving callers
      // surface as "frame delivered after close" assertions.
      hostTransport.send({ type: 'bye' })
      const received: unknown[] = []
      joinerTransport.onMessage((m) => received.push(m))
      await flushMicrotasks()
      expect(received.length).toBe(1)
    })
  })

  await describe('FakeDataChannel', async () => {
    await it('starts in connecting state and transitions on open/close', async () => {
      const c = new FakeDataChannel('op')
      expect(c.readyState).toBe('connecting')
      c.open()
      expect(c.readyState).toBe('open')
      c.close()
      expect(c.readyState).toBe('closed')
    })

    await it('records sent frames; deliver() drives onmessage', async () => {
      const c = new FakeDataChannel('op')
      let lastInbound: unknown = null
      c.onmessage = (ev) => {
        lastInbound = ev.data
      }
      c.send('outgoing')
      expect(c.sentFrames).toStrictEqual(['outgoing'])
      c.deliver({ kind: 'tile.paint' })
      expect(lastInbound).toBe(JSON.stringify({ kind: 'tile.paint' }))
    })
  })

  await describe('wireChannelDelivery', async () => {
    await it('cross-wires send → deliver between two FakeDataChannels', async () => {
      const a = new FakeDataChannel('op')
      const b = new FakeDataChannel('op')
      wireChannelDelivery(a, b)
      const aIn: unknown[] = []
      const bIn: unknown[] = []
      a.onmessage = (e) => aIn.push(e.data)
      b.onmessage = (e) => bIn.push(e.data)

      a.send('from-a')
      b.send('from-b')
      await flushMicrotasks()

      // Cross-delivery: A's send shows up at B and vice versa.
      // Self-delivery does NOT happen (channels don't echo).
      expect(bIn).toStrictEqual(['from-a'])
      expect(aIn).toStrictEqual(['from-b'])
      // Sent frames still get recorded so assertions work both ways.
      expect(a.sentFrames).toStrictEqual(['from-a'])
      expect(b.sentFrames).toStrictEqual(['from-b'])
    })
  })

  await describe('FakeRTCPeerConnection + rtcFactoryFor', async () => {
    await it('creates and tracks data channels', async () => {
      const pc = new FakeRTCPeerConnection()
      const c = pc.createDataChannel('op', { ordered: true })
      expect(c.label).toBe('op')
      expect(pc.channels).toContain(c)
    })

    await it('simulateIncomingChannel fires ondatachannel', async () => {
      const pc = new FakeRTCPeerConnection()
      let received: FakeDataChannel | null = null
      pc.ondatachannel = (ev) => {
        received = ev.channel
      }
      const c = pc.simulateIncomingChannel('awareness')
      expect(received).toBe(c)
      expect(c.label).toBe('awareness')
    })

    await it('rtcFactoryFor returns a constructor wrapping the same instance', async () => {
      const pc = new FakeRTCPeerConnection({ iceServers: [{ urls: 'stun:example.com' }] })
      const Factory = rtcFactoryFor(pc)
      const made = new Factory()
      expect(made).toBe(pc as unknown as RTCPeerConnection)
    })
  })

  await describe('createConnectedSessionPair', async () => {
    await it('hands back two PeerSessions in `connected` state', async () => {
      const pair = await createConnectedSessionPair()
      try {
        expect(pair.host.getState()).toBe('connected')
        expect(pair.joiner.getState()).toBe('connected')
      } finally {
        pair.close()
      }
    })

    await it('cross-delivers ops sent on the host op channel to the joiner', async () => {
      const pair = await createConnectedSessionPair()
      try {
        const opsReceived: unknown[] = []
        pair.joiner.events.on('op-received', ({ op }) => opsReceived.push(op))

        pair.host.sendOp({ kind: 'tile.paint', payload: { x: 1, y: 2 } })
        await flushMicrotasks()

        expect(opsReceived).toStrictEqual([{ kind: 'tile.paint', payload: { x: 1, y: 2 } }])
      } finally {
        pair.close()
      }
    })

    await it('cross-delivers awareness in both directions', async () => {
      const pair = await createConnectedSessionPair()
      try {
        const hostInbound: unknown[] = []
        const joinerInbound: unknown[] = []
        pair.host.events.on('awareness-received', ({ data }) => hostInbound.push(data))
        pair.joiner.events.on('awareness-received', ({ data }) => joinerInbound.push(data))

        pair.host.sendAwareness({ type: 'presence', peerId: 'A', info: { displayName: 'A', color: '#f00' } })
        pair.joiner.sendAwareness({ type: 'presence', peerId: 'B', info: { displayName: 'B', color: '#0f0' } })
        await flushMicrotasks()

        expect(hostInbound).toStrictEqual([
          { type: 'presence', peerId: 'B', info: { displayName: 'B', color: '#0f0' } },
        ])
        expect(joinerInbound).toStrictEqual([
          { type: 'presence', peerId: 'A', info: { displayName: 'A', color: '#f00' } },
        ])
      } finally {
        pair.close()
      }
    })

    await it('close() tears both sessions down idempotently', async () => {
      const pair: ConnectedSessionPair = await createConnectedSessionPair()
      pair.close()
      pair.close() // second call is a no-op
      expect(pair.host.getState()).toBe('closed')
      expect(pair.joiner.getState()).toBe('closed')
    })
  })

  await describe('InMemoryTransport equality check (sanity)', async () => {
    await it('a fresh transport has no `other` and silently drops sends', async () => {
      const t = new InMemoryTransport()
      // Should not throw.
      t.send({ type: 'bye' })
      expect(t.sent.length).toBe(1)
    })
  })
}
