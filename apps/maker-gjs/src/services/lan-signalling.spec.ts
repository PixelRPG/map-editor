import { EventEmitter } from 'node:events'
import { describe, expect, it, on } from '@gjsify/unit'

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
  })
}
