import { describe, expect, it } from '@gjsify/unit'

import { OutboundOpStamper } from './collab-op-stamper.ts'

export default async () => {
  await describe('OutboundOpStamper', async () => {
    await it('stamps our peer id and a monotonic sequence', async () => {
      const stamper = new OutboundOpStamper('peer-a')
      expect(stamper.next()).toStrictEqual({ peerId: 'peer-a', seq: 0 })
      expect(stamper.next()).toStrictEqual({ peerId: 'peer-a', seq: 1 })
    })

    await it('shares ONE sequence across plain ops and chunked transfers', async () => {
      // `(peerId, seq)` is the transport identity a receiver dedupes on.
      // A per-channel counter would reuse a seq across channels and make
      // one of the two sends invisible to the peer — invisible solo,
      // because a solo peer never dedupes anything.
      const stamper = new OutboundOpStamper('peer-a')
      const seqs = [
        stamper.next().seq,
        stamper.stamp({ kind: 'chunk', index: 0 }).seq,
        stamper.stamp({ kind: 'chunk', index: 1 }).seq,
        stamper.next().seq,
      ]
      expect(seqs).toStrictEqual([0, 1, 2, 3])
      expect(new Set(seqs).size).toBe(seqs.length)
    })

    await it('keeps the stamped op shape — payload first, provenance last', async () => {
      const stamper = new OutboundOpStamper('peer-a')
      const stamped = stamper.stamp({ kind: 'chunk', payload: 'x' })
      expect(stamped).toStrictEqual({ kind: 'chunk', payload: 'x', peerId: 'peer-a', seq: 0 })
      expect(Object.keys(stamped)).toStrictEqual(['kind', 'payload', 'peerId', 'seq'])
    })

    await it('namespaces transfer ids by peer so two peers cannot collide in a reassembler', async () => {
      const a = new OutboundOpStamper('peer-a')
      const b = new OutboundOpStamper('peer-b')
      expect(a.nextTransferId('s')).toBe('peer-a:s0')
      expect(a.nextTransferId('u')).toBe('peer-a:u1')
      expect(b.nextTransferId('s')).toBe('peer-b:s0')
    })

    await it('advances the transfer counter independently of the op sequence', async () => {
      const stamper = new OutboundOpStamper('peer-a')
      stamper.next()
      stamper.next()
      expect(stamper.nextTransferId('s')).toBe('peer-a:s0')
    })
  })
}
