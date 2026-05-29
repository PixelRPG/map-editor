import { describe, expect, it, vi } from 'vitest'

import { RoomManager, type RoomEvent } from './room-manager.ts'
import type { SignallingPeer } from './types.ts'

class FakePeer implements SignallingPeer {
  public readonly received: string[] = []
  public closed = false
  send(frame: string): void {
    this.received.push(frame)
  }
  close(): void {
    this.closed = true
  }
}

describe('RoomManager', () => {
  it('admits one host and one joiner per room', () => {
    const rm = new RoomManager()
    expect(rm.join('a', 'host', new FakePeer())).toBe(true)
    expect(rm.join('a', 'joiner', new FakePeer())).toBe(true)
    expect(rm.size).toBe(1)
  })

  it('rejects a second peer trying to claim a taken slot', () => {
    const events: RoomEvent[] = []
    const rm = new RoomManager({ log: (e) => events.push(e) })
    rm.join('a', 'host', new FakePeer())
    expect(rm.join('a', 'host', new FakePeer())).toBe(false)
    expect(events.find((e) => e.kind === 'rejected')).toMatchObject({
      kind: 'rejected',
      role: 'host',
      reason: 'slot-taken',
    })
  })

  it('forwards frames between host and joiner, never echoing to sender', () => {
    const rm = new RoomManager()
    const host = new FakePeer()
    const joiner = new FakePeer()
    rm.join('a', 'host', host)
    rm.join('a', 'joiner', joiner)

    rm.forward('a', 'host', '{"type":"sdp","payload":1}', 'sdp')
    expect(joiner.received).toEqual(['{"type":"sdp","payload":1}'])
    expect(host.received).toEqual([])

    rm.forward('a', 'joiner', '{"type":"ice-candidate","payload":null}', 'ice-candidate')
    expect(host.received).toEqual(['{"type":"ice-candidate","payload":null}'])
    expect(joiner.received).toHaveLength(1)
  })

  it('drops frames when the counterpart slot is empty', () => {
    const rm = new RoomManager()
    const host = new FakePeer()
    rm.join('a', 'host', host)
    // No joiner yet — forward must be a no-op, not throw.
    expect(() => rm.forward('a', 'host', '{"type":"sdp"}', 'sdp')).not.toThrow()
    expect(host.received).toEqual([])
  })

  it('reaps the room once both slots are empty', () => {
    const events: RoomEvent[] = []
    const rm = new RoomManager({ log: (e) => events.push(e) })

    rm.join('a', 'host', new FakePeer())
    rm.join('a', 'joiner', new FakePeer())
    rm.leave('a', 'host')
    expect(rm.size).toBe(1) // joiner is still there
    rm.leave('a', 'joiner')
    expect(rm.size).toBe(0)
    expect(events.filter((e) => e.kind === 'reaped').length).toBe(1)
  })

  it('reaps idle rooms via sweep() based on the supplied clock', () => {
    let t = 0
    const rm = new RoomManager({ idleMs: 1000, now: () => t })
    const host = new FakePeer()
    rm.join('a', 'host', host)

    t = 999
    rm.sweep()
    expect(rm.size).toBe(1) // not idle long enough
    expect(host.closed).toBe(false)

    t = 1500
    rm.sweep()
    expect(rm.size).toBe(0)
    expect(host.closed).toBe(true)
  })

  it('does not reap a room receiving traffic', () => {
    let t = 0
    const rm = new RoomManager({ idleMs: 1000, now: () => t })
    const host = new FakePeer()
    const joiner = new FakePeer()
    rm.join('a', 'host', host)
    rm.join('a', 'joiner', joiner)

    t = 800
    rm.forward('a', 'host', '{"type":"sdp"}', 'sdp')

    t = 1500
    rm.sweep()
    expect(rm.size).toBe(1) // lastActivity bumped by the forward at t=800
  })

  it('logs each high-level event with the room + role context', () => {
    const log = vi.fn()
    const rm = new RoomManager({ log })

    rm.join('a', 'host', new FakePeer())
    rm.join('a', 'joiner', new FakePeer())
    rm.forward('a', 'host', '{"type":"sdp"}', 'sdp')
    rm.leave('a', 'host')
    rm.leave('a', 'joiner')

    const kinds = log.mock.calls.map((c) => (c[0] as RoomEvent).kind)
    expect(kinds).toEqual(['joined', 'joined', 'message', 'left', 'left', 'reaped'])
  })
})
