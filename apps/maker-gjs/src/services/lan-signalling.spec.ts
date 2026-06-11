import { EventEmitter } from 'node:events'
import { describe, expect, it } from '@gjsify/unit'

import { wrapWebSocket } from './lan-signalling.ts'

class FakeWs extends EventEmitter {
  public sent: string[] = []
  public closed = false
  public closeCalled = 0
  send(frame: string) {
    this.sent.push(frame)
  }
  close() {
    this.closeCalled++
    this.closed = true
    this.emit('close')
  }
}

export default async () => {
  // `wrapWebSocket` exercises the Node `ws` package under both
  // runtimes — under GJS via the `@gjsify/ws` polyfill. Since the
  // FakeWs replaces the underlying ws.WebSocket, all matchers stay
  // platform-indep. We do gate on `Node.js` ONLY for the wrap-error
  // test that relies on `vi.spyOn`-equivalent behaviour that we'd
  // need an extra helper to express on GJS.
  await describe('wrapWebSocket', async () => {
    await it('routes inbound JSON messages to the onMessage handler', async () => {
      const ws = new FakeWs()
      const transport = wrapWebSocket(ws as never)
      const seen: unknown[] = []
      transport.onMessage((msg) => seen.push(msg))

      ws.emit('message', JSON.stringify({ type: 'sdp', payload: { type: 'offer', sdp: 'x' } }))
      ws.emit('message', JSON.stringify({ type: 'ice-candidate', payload: { candidate: 'c' } }))
      ws.emit('message', JSON.stringify({ type: 'bye' }))

      expect(seen).toStrictEqual([
        { type: 'sdp', payload: { type: 'offer', sdp: 'x' } },
        { type: 'ice-candidate', payload: { candidate: 'c' } },
        { type: 'bye' },
      ])
    })

    await it('drops malformed JSON frames without throwing', async () => {
      const ws = new FakeWs()
      const transport = wrapWebSocket(ws as never)
      const seen: unknown[] = []
      transport.onMessage((msg) => seen.push(msg))

      expect(() => ws.emit('message', 'not-json')).not.toThrow()
      expect(seen).toHaveLength(0)
    })

    await it('drops binary frames (isBinary=true)', async () => {
      const ws = new FakeWs()
      const transport = wrapWebSocket(ws as never)
      const seen: unknown[] = []
      transport.onMessage((msg) => seen.push(msg))

      ws.emit('message', Buffer.from('{"type":"sdp"}'), true)
      expect(seen).toHaveLength(0)
    })

    await it('ignores frames whose type is not part of the wire vocabulary', async () => {
      const ws = new FakeWs()
      const transport = wrapWebSocket(ws as never)
      const seen: unknown[] = []
      transport.onMessage((msg) => seen.push(msg))

      ws.emit('message', JSON.stringify({ type: 'banana', payload: 'x' }))
      expect(seen).toHaveLength(0)
    })

    await it('forwards send() to the underlying ws.send() as JSON', async () => {
      const ws = new FakeWs()
      const transport = wrapWebSocket(ws as never)
      transport.send({ type: 'sdp', payload: { type: 'offer', sdp: 'y' } })

      expect(ws.sent).toStrictEqual([JSON.stringify({ type: 'sdp', payload: { type: 'offer', sdp: 'y' } })])
    })

    await it('close() calls ws.close once and becomes a no-op afterwards', async () => {
      const ws = new FakeWs()
      const transport = wrapWebSocket(ws as never)

      transport.close()
      transport.close()
      expect(ws.closeCalled).toBe(1)
    })

    await it('after the socket closes, further send()s are dropped silently', async () => {
      const ws = new FakeWs()
      const transport = wrapWebSocket(ws as never)

      ws.emit('close')
      expect(() => transport.send({ type: 'bye' })).not.toThrow()
      expect(ws.sent).toStrictEqual([])
    })

    await it('send() errors from the underlying ws do not propagate', async () => {
      const ws = new FakeWs()
      const transport = wrapWebSocket(ws as never)
      // Replace ws.send with a throwing version — @gjsify/unit has
      // no vi.spyOn equivalent, so the test does the override
      // directly on the fake.
      ws.send = () => {
        throw new Error('socket broken')
      }

      expect(() => transport.send({ type: 'bye' })).not.toThrow()
    })

    await it('REGRESSION (2026-05-30 race): buffers inbound messages received BEFORE onMessage is wired', async () => {
      // This is the bug that blocked Pair-Editing on 2026-05-30:
      // host's `wss.on('connection')` fires synchronously when the
      // joiner's WS handshake completes; the host's
      // `PeerSession.connect()` runs `createOffer` +
      // `setLocalDescription` + `signalling.send(sdp)` within the
      // same JS tick. On the joiner side, control flows out of
      // `await connectLanJoinerTransport(...)` through
      // `SessionService.openSession` + `new CollabSession` + `new
      // PeerSession` BEFORE `signalling.onMessage(handler)` is
      // called. Pre-fix, the SDP offer arrived during that window
      // and was silently dropped; the joiner timed out 15 s later
      // with no other evidence than `[peer-session/joiner] waiting
      // for host SDP offer over signalling` followed by the
      // CollabTimeoutError.
      const ws = new FakeWs()
      const transport = wrapWebSocket(ws as never)

      // Deliver TWO messages BEFORE the inbound handler is wired —
      // simulating the race window.
      const offer = { type: 'sdp' as const, payload: { type: 'offer' as const, sdp: 'v=0\r\n' } }
      const candidate = { type: 'ice-candidate' as const, payload: { candidate: 'a=candidate:1' } }
      ws.emit('message', JSON.stringify(offer))
      ws.emit('message', JSON.stringify(candidate))

      // Now register the handler — the buffered messages MUST be
      // delivered in arrival order.
      const seen: unknown[] = []
      transport.onMessage((msg) => seen.push(msg))
      expect(seen).toStrictEqual([offer, candidate])

      // After draining, subsequent messages still flow through
      // synchronously.
      const bye = { type: 'bye' as const }
      ws.emit('message', JSON.stringify(bye))
      expect(seen).toStrictEqual([offer, candidate, bye])
    })

    await it('REGRESSION: malformed frames during the race window are dropped, not buffered', async () => {
      // The buffer should preserve the same filtering as the live
      // path: malformed JSON dropped, unrecognised types dropped.
      const ws = new FakeWs()
      const transport = wrapWebSocket(ws as never)

      ws.emit('message', 'not-json')
      ws.emit('message', JSON.stringify({ type: 'banana' }))
      ws.emit('message', JSON.stringify({ type: 'bye' }))

      const seen: unknown[] = []
      transport.onMessage((msg) => seen.push(msg))
      expect(seen).toStrictEqual([{ type: 'bye' }])
    })
  })
}
