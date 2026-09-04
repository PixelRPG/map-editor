/**
 * ICE-candidate buffering across the remote-description gap.
 *
 * The failure this prevents is order-dependent and therefore
 * intermittent: on a fast link the peer's candidates can arrive before
 * its SDP, `addIceCandidate` refuses them, and the connection stalls in
 * `negotiating` with no error anyone sees.
 */

import { describe, expect, it } from '@gjsify/unit'

import { PendingIceBuffer } from './pending-ice-buffer.ts'

const candidate = (id: string): RTCIceCandidateInit => ({ candidate: id, sdpMid: '0' })

export default async () => {
  await describe('PendingIceBuffer', async () => {
    await it('buffers candidates until the remote description is set', async () => {
      const buffer = new PendingIceBuffer()
      expect(buffer.accept(candidate('a'))).toBe(false)
      expect(buffer.accept(candidate('b'))).toBe(false)
      expect(buffer.size).toBe(2)
    })

    await it('delivers candidates directly once the remote description is set', async () => {
      const buffer = new PendingIceBuffer()
      buffer.markRemoteDescriptionSet()
      expect(buffer.accept(candidate('a'))).toBe(true)
      expect(buffer.size).toBe(0)
    })

    await it('drains buffered candidates in arrival order', async () => {
      const buffer = new PendingIceBuffer()
      buffer.accept(candidate('a'))
      buffer.accept(candidate('b'))
      buffer.markRemoteDescriptionSet()
      expect(buffer.drain().map((c) => c.candidate)).toStrictEqual(['a', 'b'])
    })

    await it('empties on drain so a second drain replays nothing', async () => {
      const buffer = new PendingIceBuffer()
      buffer.accept(candidate('a'))
      buffer.drain()
      expect(buffer.size).toBe(0)
      expect(buffer.drain()).toStrictEqual([])
    })

    await it('reports an empty buffer so callers can skip the drain await', async () => {
      // The handshake's common path has nothing buffered; guarding the
      // await on `size` keeps its original microtask timing.
      expect(new PendingIceBuffer().size).toBe(0)
    })
  })
}
