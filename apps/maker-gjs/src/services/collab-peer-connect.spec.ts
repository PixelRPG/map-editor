import { describe, expect, it } from '@gjsify/unit'
import type { PeerSessionState } from '@pixelrpg/engine'

import { PEER_CONNECT_TIMEOUT_MS, waitForPeerConnected } from './collab-peer-connect.ts'

/** Minimal state source: a mutable current state + manual transitions. */
function fakePeer(initial: PeerSessionState) {
  let state = initial
  const listeners = new Set<(s: PeerSessionState) => void>()
  return {
    getState: () => state,
    subscribe: (listener: (s: PeerSessionState) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    transition(next: PeerSessionState) {
      state = next
      for (const listener of [...listeners]) listener(next)
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

export default async () => {
  await describe('waitForPeerConnected', async () => {
    await it('resolves immediately when the peer is already connected', async () => {
      const peer = fakePeer('connected')
      await waitForPeerConnected(peer.getState, peer.subscribe)
      expect(peer.listenerCount).toBe(0)
    })

    await it('resolves on the transition to connected and unsubscribes', async () => {
      const peer = fakePeer('negotiating')
      const pending = waitForPeerConnected(peer.getState, peer.subscribe)
      peer.transition('connected')
      await pending
      expect(peer.listenerCount).toBe(0)
    })

    await it('REGRESSION (2026-05-30): a peer stuck in negotiating never resolves on its own', async () => {
      // `peer.connect()` resolves on ICE-gather-started, so the caller
      // has to gate on `connected` separately — otherwise it starts
      // sending on channels that never opened.
      const peer = fakePeer('negotiating')
      let settled = false
      void waitForPeerConnected(peer.getState, peer.subscribe).then(
        () => {
          settled = true
        },
        () => {
          settled = true
        },
      )
      await new Promise<void>((r) => setTimeout(r, 20))
      expect(settled).toBe(false)
      peer.transition('closed')
    })

    for (const terminal of ['closed', 'error'] as const) {
      await it(`rejects when the peer is already "${terminal}"`, async () => {
        const peer = fakePeer(terminal)
        let message = ''
        try {
          await waitForPeerConnected(peer.getState, peer.subscribe)
        } catch (err) {
          message = (err as Error).message
        }
        expect(message).toContain(`already "${terminal}"`)
      })

      await it(`rejects when the peer transitions to "${terminal}" before connecting`, async () => {
        const peer = fakePeer('negotiating')
        const pending = waitForPeerConnected(peer.getState, peer.subscribe)
        peer.transition(terminal)
        let message = ''
        try {
          await pending
        } catch (err) {
          message = (err as Error).message
        }
        expect(message).toContain(`transitioned to "${terminal}"`)
        expect(peer.listenerCount).toBe(0)
      })
    }

    await it('keeps the production deadline generous enough for slow ICE', async () => {
      expect(PEER_CONNECT_TIMEOUT_MS).toBe(15_000)
    })
  })
}
