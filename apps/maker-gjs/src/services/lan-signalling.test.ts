import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import { wrapWebSocket } from './lan-signalling.ts'

/**
 * Fake `ws.WebSocket` exposing the subset {@link wrapWebSocket}
 * consumes. Lets us drive `message` / `close` events from the test
 * without touching a real socket.
 */
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

describe('wrapWebSocket', () => {
  it('routes inbound JSON messages to the onMessage handler', () => {
    const ws = new FakeWs()
    const transport = wrapWebSocket(ws as never)
    const seen: unknown[] = []
    transport.onMessage((msg) => seen.push(msg))

    ws.emit('message', JSON.stringify({ type: 'sdp', payload: { type: 'offer', sdp: 'x' } }))
    ws.emit('message', JSON.stringify({ type: 'ice-candidate', payload: { candidate: 'c' } }))
    ws.emit('message', JSON.stringify({ type: 'bye' }))

    expect(seen).toEqual([
      { type: 'sdp', payload: { type: 'offer', sdp: 'x' } },
      { type: 'ice-candidate', payload: { candidate: 'c' } },
      { type: 'bye' },
    ])
  })

  it('drops malformed JSON frames without throwing', () => {
    const ws = new FakeWs()
    const transport = wrapWebSocket(ws as never)
    const seen: unknown[] = []
    transport.onMessage((msg) => seen.push(msg))

    expect(() => ws.emit('message', 'not-json')).not.toThrow()
    expect(seen).toHaveLength(0)
  })

  it('drops binary frames (isBinary=true)', () => {
    const ws = new FakeWs()
    const transport = wrapWebSocket(ws as never)
    const seen: unknown[] = []
    transport.onMessage((msg) => seen.push(msg))

    // Buffer payload + isBinary=true
    ws.emit('message', Buffer.from('{"type":"sdp"}'), true)
    expect(seen).toHaveLength(0)
  })

  it('ignores frames whose type is not part of the wire vocabulary', () => {
    const ws = new FakeWs()
    const transport = wrapWebSocket(ws as never)
    const seen: unknown[] = []
    transport.onMessage((msg) => seen.push(msg))

    ws.emit('message', JSON.stringify({ type: 'banana', payload: 'x' }))
    expect(seen).toHaveLength(0)
  })

  it('forwards send() to the underlying ws.send() as JSON', () => {
    const ws = new FakeWs()
    const transport = wrapWebSocket(ws as never)
    transport.send({ type: 'sdp', payload: { type: 'offer', sdp: 'y' } })

    expect(ws.sent).toEqual([JSON.stringify({ type: 'sdp', payload: { type: 'offer', sdp: 'y' } })])
  })

  it('close() calls ws.close once and becomes a no-op afterwards', () => {
    const ws = new FakeWs()
    const transport = wrapWebSocket(ws as never)

    transport.close()
    transport.close()
    expect(ws.closeCalled).toBe(1)
  })

  it('after the socket closes, further send()s are dropped silently', () => {
    const ws = new FakeWs()
    const transport = wrapWebSocket(ws as never)

    ws.emit('close')
    expect(() => transport.send({ type: 'bye' })).not.toThrow()
    expect(ws.sent).toEqual([])
  })

  it('send() errors from the underlying ws do not propagate', () => {
    const ws = new FakeWs()
    const transport = wrapWebSocket(ws as never)
    vi.spyOn(ws, 'send').mockImplementation(() => {
      throw new Error('socket broken')
    })

    expect(() => transport.send({ type: 'bye' })).not.toThrow()
  })
})
