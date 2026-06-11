/**
 * Tests for {@link PreAttachOpBuffer} — the joiner-side holding pen
 * for scene Command ops delivered before `attachEngine` builds the
 * SessionController. Covers the three behaviours the CollabSession
 * relies on: arrival-order replay, watermark dedupe against the
 * loaded snapshot, and the defensive cap (drop-oldest + warn).
 */

import { describe, expect, it } from '@gjsify/unit'

import type { Operation } from '../commands/types.ts'
import { isCoveredByWatermark, PRE_ATTACH_OP_BUFFER_CAP, PreAttachOpBuffer } from './pre-attach-op-buffer.ts'

function op(peerId: string, seq: number, kind = 'tile.paint'): Operation {
  return { kind, payload: { seq }, peerId, seq }
}

async function muteWarn<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = console.warn
  console.warn = () => {}
  try {
    return await fn()
  } finally {
    console.warn = original
  }
}

export default async () => {
  await describe('PreAttachOpBuffer', async () => {
    await it('drains buffered ops in arrival order and empties the buffer', async () => {
      const buffer = new PreAttachOpBuffer()
      buffer.push(op('host', 0))
      buffer.push(op('host', 1, 'object.place'))
      buffer.push(op('host', 2, 'tile.erase'))
      expect(buffer.size).toBe(3)

      const drained = buffer.drain() as Operation[]
      expect(drained.map((o) => o.seq)).toStrictEqual([0, 1, 2])
      expect(drained.map((o) => o.kind)).toStrictEqual(['tile.paint', 'object.place', 'tile.erase'])
      expect(buffer.size).toBe(0)
      // Second drain returns nothing — replay is one-shot.
      expect(buffer.drain()).toStrictEqual([])
    })

    await it('drain(watermark) skips host ops below nextSeq, keeps the rest', async () => {
      const buffer = new PreAttachOpBuffer()
      buffer.push(op('host', 0)) // in snapshot — skip
      buffer.push(op('host', 1)) // in snapshot — skip
      buffer.push(op('host', 2)) // at watermark — replay
      buffer.push(op('host', 3)) // after watermark — replay

      const drained = buffer.drain({ peerId: 'host', nextSeq: 2 }) as Operation[]
      expect(drained.map((o) => o.seq)).toStrictEqual([2, 3])
    })

    await it('watermark only covers the snapshot host — other peers replay fully', async () => {
      const buffer = new PreAttachOpBuffer()
      buffer.push(op('host', 0))
      buffer.push(op('other-peer', 0))

      const drained = buffer.drain({ peerId: 'host', nextSeq: 5 }) as Operation[]
      expect(drained).toHaveLength(1)
      expect(drained[0]?.peerId).toBe('other-peer')
    })

    await it('keeps ops without a usable seq (malformed shape is the controller replay path’s problem)', async () => {
      const buffer = new PreAttachOpBuffer()
      buffer.push({ kind: 'tile.paint', payload: {}, peerId: 'host' }) // no seq
      buffer.push({ kind: 'tile.paint', payload: {}, peerId: 'host', seq: 'NaN-ish' }) // non-numeric seq
      buffer.push(null)

      const drained = buffer.drain({ peerId: 'host', nextSeq: 100 })
      expect(drained).toHaveLength(3)
    })

    await it('caps the buffer — drops oldest, counts drops, warns once', async () => {
      const buffer = new PreAttachOpBuffer(3)
      let warns = 0
      const original = console.warn
      console.warn = () => {
        warns++
      }
      try {
        buffer.push(op('host', 0))
        buffer.push(op('host', 1))
        buffer.push(op('host', 2))
        buffer.push(op('host', 3)) // evicts seq 0
        buffer.push(op('host', 4)) // evicts seq 1
      } finally {
        console.warn = original
      }
      expect(buffer.size).toBe(3)
      expect(buffer.dropped).toBe(2)
      expect(warns).toBe(1)

      const drained = buffer.drain() as Operation[]
      expect(drained.map((o) => o.seq)).toStrictEqual([2, 3, 4])
      expect(buffer.dropped).toBe(0)
    })

    await it('clear() discards everything and resets counters', async () => {
      const buffer = new PreAttachOpBuffer(1)
      await muteWarn(() => {
        buffer.push(op('host', 0))
        buffer.push(op('host', 1))
      })
      expect(buffer.dropped).toBe(1)
      buffer.clear()
      expect(buffer.size).toBe(0)
      expect(buffer.dropped).toBe(0)
      expect(buffer.drain()).toStrictEqual([])
    })

    await it('default cap is a few thousand ops', async () => {
      expect(PRE_ATTACH_OP_BUFFER_CAP).toBeGreaterThanOrEqual(1000)
    })
  })

  await describe('isCoveredByWatermark', async () => {
    await it('covers only matching peer + integer seq strictly below nextSeq', async () => {
      const wm = { peerId: 'host', nextSeq: 3 }
      expect(isCoveredByWatermark(op('host', 2), wm)).toBe(true)
      expect(isCoveredByWatermark(op('host', 3), wm)).toBe(false)
      expect(isCoveredByWatermark(op('joiner', 1), wm)).toBe(false)
      expect(isCoveredByWatermark({ peerId: 'host', seq: 1.5 }, wm)).toBe(false)
      expect(isCoveredByWatermark({ peerId: 'host' }, wm)).toBe(false)
      expect(isCoveredByWatermark(null, wm)).toBe(false)
      expect(isCoveredByWatermark('not-an-op', wm)).toBe(false)
    })
  })
}
