import { describe, expect, it } from '@gjsify/unit'

import {
  AwarenessManager,
  type AwarenessMessage,
  type AwarenessPeerState,
  DEFAULT_PEER_COLOR,
  isAwarenessMessage,
} from './awareness.ts'

interface FakeClock {
  now: () => number
  advance: (ms: number) => void
}

function fakeClock(start = 0): FakeClock {
  let t = start
  return {
    now: () => t,
    advance: (ms) => {
      t += ms
    },
  }
}

const LOCAL_PEER = 'peer-local'
const LOCAL_INFO = { displayName: 'Alice', color: '#1c71d8' }

export default async () => {
  await describe('isAwarenessMessage', async () => {
    await it('accepts every valid variant', async () => {
      expect(isAwarenessMessage({ type: 'presence', peerId: 'p1', info: LOCAL_INFO })).toBe(true)
      expect(isAwarenessMessage({ type: 'cursor', peerId: 'p1', cursor: { sceneId: 's1', x: 1, y: 2 } })).toBe(true)
      expect(isAwarenessMessage({ type: 'selection', peerId: 'p1', selection: { placementIds: ['a', 'b'] } })).toBe(
        true,
      )
      expect(isAwarenessMessage({ type: 'leave', peerId: 'p1' })).toBe(true)
    })

    await it('rejects malformed payloads', async () => {
      expect(isAwarenessMessage(null)).toBe(false)
      expect(isAwarenessMessage(42)).toBe(false)
      expect(isAwarenessMessage('not an object')).toBe(false)
      expect(isAwarenessMessage({ type: 'presence' })).toBe(false)
      expect(isAwarenessMessage({ type: 'presence', peerId: '', info: LOCAL_INFO })).toBe(false)
      expect(
        isAwarenessMessage({ type: 'cursor', peerId: 'p1', cursor: { sceneId: 's', x: 'not-a-number', y: 0 } }),
      ).toBe(false)
      expect(isAwarenessMessage({ type: 'selection', peerId: 'p1', selection: { placementIds: ['a', 5] } })).toBe(false)
      expect(isAwarenessMessage({ type: 'unknown', peerId: 'p1' })).toBe(false)
    })
  })

  await describe('AwarenessManager — outgoing', async () => {
    await it('announce broadcasts presence with local info', async () => {
      const sent: AwarenessMessage[] = []
      const mgr = new AwarenessManager({
        localPeerId: LOCAL_PEER,
        localInfo: LOCAL_INFO,
        send: (m) => sent.push(m),
      })
      mgr.announce()
      expect(sent).toStrictEqual([{ type: 'presence', peerId: LOCAL_PEER, info: LOCAL_INFO }])
    })

    await it('sendCursor passes the first frame through immediately', async () => {
      const clock = fakeClock(1_000)
      const sent: AwarenessMessage[] = []
      const mgr = new AwarenessManager({
        localPeerId: LOCAL_PEER,
        localInfo: LOCAL_INFO,
        now: clock.now,
        send: (m) => sent.push(m),
      })
      mgr.sendCursor({ sceneId: 'scene-1', x: 10, y: 20 })
      expect(sent.length).toBe(1)
      expect(sent[0]).toStrictEqual({
        type: 'cursor',
        peerId: LOCAL_PEER,
        cursor: { sceneId: 'scene-1', x: 10, y: 20 },
      })
    })

    await it('sendCursor coalesces calls within the throttle window', async () => {
      const clock = fakeClock(0)
      const sent: AwarenessMessage[] = []
      const mgr = new AwarenessManager({
        localPeerId: LOCAL_PEER,
        localInfo: LOCAL_INFO,
        now: clock.now,
        cursorThrottleMs: 30,
        send: (m) => sent.push(m),
      })
      mgr.sendCursor({ sceneId: 's', x: 0, y: 0 })
      clock.advance(5)
      mgr.sendCursor({ sceneId: 's', x: 1, y: 1 })
      clock.advance(5)
      mgr.sendCursor({ sceneId: 's', x: 2, y: 2 })
      // only the first frame got through; (1,1) and (2,2) coalesced.
      expect(sent.length).toBe(1)
      expect(sent[0]).toStrictEqual({ type: 'cursor', peerId: LOCAL_PEER, cursor: { sceneId: 's', x: 0, y: 0 } })

      // past the window, the NEXT sendCursor flushes the latest.
      clock.advance(30)
      mgr.sendCursor({ sceneId: 's', x: 3, y: 3 })
      expect(sent.length).toBe(2)
      expect(sent[1]).toStrictEqual({ type: 'cursor', peerId: LOCAL_PEER, cursor: { sceneId: 's', x: 3, y: 3 } })
    })

    await it('flushCursor emits the pending coalesced frame once the window opens', async () => {
      const clock = fakeClock(0)
      const sent: AwarenessMessage[] = []
      const mgr = new AwarenessManager({
        localPeerId: LOCAL_PEER,
        localInfo: LOCAL_INFO,
        now: clock.now,
        cursorThrottleMs: 30,
        send: (m) => sent.push(m),
      })
      mgr.sendCursor({ sceneId: 's', x: 0, y: 0 })
      clock.advance(5)
      mgr.sendCursor({ sceneId: 's', x: 9, y: 9 })

      // Mouse stopped — still inside the window. flushCursor is a no-op.
      mgr.flushCursor()
      expect(sent.length).toBe(1)

      // After the window opens, flushCursor delivers the latest.
      clock.advance(30)
      mgr.flushCursor()
      expect(sent.length).toBe(2)
      expect(sent[1]).toStrictEqual({ type: 'cursor', peerId: LOCAL_PEER, cursor: { sceneId: 's', x: 9, y: 9 } })

      // Idempotent — no pending frame after a flush.
      mgr.flushCursor()
      expect(sent.length).toBe(2)
    })

    await it('sendSelection is unthrottled', async () => {
      const sent: AwarenessMessage[] = []
      const mgr = new AwarenessManager({
        localPeerId: LOCAL_PEER,
        localInfo: LOCAL_INFO,
        send: (m) => sent.push(m),
      })
      mgr.sendSelection({ placementIds: ['a'] })
      mgr.sendSelection({ placementIds: ['a', 'b'] })
      mgr.sendSelection({ placementIds: [] })
      expect(sent.length).toBe(3)
    })

    await it('leave emits a leave frame', async () => {
      const sent: AwarenessMessage[] = []
      const mgr = new AwarenessManager({
        localPeerId: LOCAL_PEER,
        localInfo: LOCAL_INFO,
        send: (m) => sent.push(m),
      })
      mgr.leave()
      expect(sent).toStrictEqual([{ type: 'leave', peerId: LOCAL_PEER }])
    })
  })

  await describe('AwarenessManager — incoming', async () => {
    await it('drops echo of our own peerId', async () => {
      const sent: AwarenessMessage[] = []
      const mgr = new AwarenessManager({
        localPeerId: LOCAL_PEER,
        localInfo: LOCAL_INFO,
        send: (m) => sent.push(m),
      })
      mgr.handleInbound({ type: 'presence', peerId: LOCAL_PEER, info: LOCAL_INFO })
      expect(mgr.getPeers().length).toBe(0)
    })

    await it('drops malformed payloads silently', async () => {
      const sent: AwarenessMessage[] = []
      const mgr = new AwarenessManager({
        localPeerId: LOCAL_PEER,
        localInfo: LOCAL_INFO,
        send: (m) => sent.push(m),
      })
      mgr.handleInbound(null)
      mgr.handleInbound('garbage')
      mgr.handleInbound({ type: 'cursor', peerId: 'remote' })
      expect(mgr.getPeers().length).toBe(0)
    })

    await it('tracks remote peer state across presence + cursor + selection', async () => {
      const clock = fakeClock(1_000)
      const mgr = new AwarenessManager({
        localPeerId: LOCAL_PEER,
        localInfo: LOCAL_INFO,
        now: clock.now,
        send: () => {},
      })
      const changes: AwarenessPeerState[] = []
      mgr.on('peer-changed', (s) => changes.push(s))

      mgr.handleInbound({
        type: 'presence',
        peerId: 'peer-bob',
        info: { displayName: 'Bob', color: '#ff0000' },
      })
      clock.advance(5)
      mgr.handleInbound({
        type: 'cursor',
        peerId: 'peer-bob',
        cursor: { sceneId: 'dungeon', x: 12, y: 7 },
      })
      clock.advance(5)
      mgr.handleInbound({ type: 'selection', peerId: 'peer-bob', selection: { placementIds: ['apple-tree'] } })

      expect(changes.length).toBe(3)
      const bob = mgr.getPeer('peer-bob')
      expect(bob).not.toBeNull()
      expect(bob?.info.displayName).toBe('Bob')
      expect(bob?.cursor).toStrictEqual({ sceneId: 'dungeon', x: 12, y: 7 })
      expect(bob?.selection?.placementIds).toStrictEqual(['apple-tree'])
      expect(bob?.lastUpdate).toBe(1_010)
    })

    await it('leave drops the peer and emits peer-left', async () => {
      const mgr = new AwarenessManager({
        localPeerId: LOCAL_PEER,
        localInfo: LOCAL_INFO,
        send: () => {},
      })
      const lefts: string[] = []
      mgr.on('peer-left', (e) => lefts.push(e.peerId))

      mgr.handleInbound({ type: 'presence', peerId: 'peer-bob', info: LOCAL_INFO })
      mgr.handleInbound({ type: 'leave', peerId: 'peer-bob' })

      expect(lefts).toStrictEqual(['peer-bob'])
      expect(mgr.getPeer('peer-bob')).toBeNull()
    })

    await it('defaults the info field when cursor arrives before presence', async () => {
      const mgr = new AwarenessManager({
        localPeerId: LOCAL_PEER,
        localInfo: LOCAL_INFO,
        send: () => {},
      })
      mgr.handleInbound({
        type: 'cursor',
        peerId: 'peer-bob',
        cursor: { sceneId: 'dungeon', x: 0, y: 0 },
      })
      const bob = mgr.getPeer('peer-bob')
      expect(bob).not.toBeNull()
      expect(bob?.info.displayName).toBe('peer-bob')
      expect(bob?.info.color).toBe(DEFAULT_PEER_COLOR)
    })
  })
}
