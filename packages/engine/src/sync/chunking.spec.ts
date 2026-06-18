/**
 * The shared chunking + reassembly contract (`chunking.ts`) — the ONE
 * implementation behind both the snapshot-on-join transfer and the
 * `__project/spriteset.*.chunk` ops. Pins the hardened validation the
 * two previous per-path copies only partially had.
 */

import { describe, expect, it } from '@gjsify/unit'

import {
  buildChunkEnvelopes,
  CHUNK_SIZE_BYTES,
  ChunkReassembler,
  MAX_CONCURRENT_TRANSFERS,
  MAX_TOTAL_CHUNKS,
} from './chunking.ts'

export default async () => {
  await describe('buildChunkEnvelopes', async () => {
    await it('slices a payload into ordered, contiguous envelopes', async () => {
      const json = 'x'.repeat(CHUNK_SIZE_BYTES * 2 + 10)
      const chunks = buildChunkEnvelopes('t1', json)

      expect(chunks.length).toBe(3)
      expect(chunks.map((c) => c.chunkIndex)).toStrictEqual([0, 1, 2])
      expect(chunks.every((c) => c.totalChunks === 3)).toBe(true)
      expect(chunks.map((c) => c.data).join('')).toBe(json)
    })

    await it('always emits at least one envelope (tiny payload)', async () => {
      const chunks = buildChunkEnvelopes('t1', '{}')
      expect(chunks.length).toBe(1)
      expect(chunks[0].totalChunks).toBe(1)
    })
  })

  await describe('ChunkReassembler — validated reassembly', async () => {
    await it('round-trips a multi-chunk JSON payload', async () => {
      const payload = { hello: 'world', n: 42 }
      const reassembler = new ChunkReassembler<typeof payload>()
      const chunks = buildChunkEnvelopes('t1', JSON.stringify(payload), 4)

      let done = 0
      for (const chunk of chunks) {
        const result = reassembler.accept(chunk)
        if (result.status === 'done') {
          done++
          expect(result.payload).toStrictEqual(payload)
        } else {
          expect(result.status).toBe('pending')
        }
      }
      expect(done).toBe(1)
    })

    await it('interleaved transfers reassemble independently by transferId', async () => {
      const reassembler = new ChunkReassembler<{ id: string }>()
      const a = buildChunkEnvelopes('a', JSON.stringify({ id: 'a' }), 4)
      const b = buildChunkEnvelopes('b', JSON.stringify({ id: 'b' }), 4)

      const results: string[] = []
      const all = [a[0], b[0], a[1], b[1], a[2], b[2]].filter(Boolean)
      // feed remaining tails
      for (const chunk of [...all, ...a.slice(3), ...b.slice(3)]) {
        const result = reassembler.accept(chunk)
        if (result.status === 'done') results.push(result.payload.id)
      }
      expect(results.sort()).toStrictEqual(['a', 'b'])
    })

    await it('rejects malformed envelopes (negative index, zero total, out-of-range)', async () => {
      const reassembler = new ChunkReassembler<unknown>()
      const bad = [
        { transferId: 't', chunkIndex: -1, totalChunks: 1, data: '' },
        { transferId: 't', chunkIndex: 0, totalChunks: 0, data: '' },
        { transferId: 't', chunkIndex: 2, totalChunks: 2, data: '' },
      ]
      for (const envelope of bad) {
        expect(reassembler.accept(envelope).status).toBe('error')
      }
    })

    await it('rejects a mid-stream totalChunks change (protocol violation)', async () => {
      const reassembler = new ChunkReassembler<unknown>()
      expect(reassembler.accept({ transferId: 't', chunkIndex: 0, totalChunks: 3, data: 'a' }).status).toBe('pending')
      const result = reassembler.accept({ transferId: 't', chunkIndex: 1, totalChunks: 4, data: 'b' })
      expect(result.status).toBe('error')
    })

    await it('ignores duplicate chunk indices (reliable-channel defensive)', async () => {
      const payload = { v: 1 }
      const reassembler = new ChunkReassembler<typeof payload>()
      const chunks = buildChunkEnvelopes('t', JSON.stringify(payload), 4)
      expect(chunks.length > 1).toBe(true)

      expect(reassembler.accept(chunks[0]).status).toBe('pending')
      expect(reassembler.accept(chunks[0]).status).toBe('pending') // duplicate
      for (const chunk of chunks.slice(1, -1)) reassembler.accept(chunk)
      expect(reassembler.accept(chunks[chunks.length - 1]).status).toBe('done')
    })

    await it('reports a parse failure with diagnostics instead of silently nulling', async () => {
      const reassembler = new ChunkReassembler<unknown>()
      const result = reassembler.accept({ transferId: 't', chunkIndex: 0, totalChunks: 1, data: 'not-json' })
      expect(result.status).toBe('error')
      if (result.status === 'error') expect(result.reason.includes('json.length=8')).toBe(true)
    })

    await it('rejects totalChunks above the cap (unbounded allocation guard)', async () => {
      const reassembler = new ChunkReassembler<unknown>()
      const result = reassembler.accept({
        transferId: 't',
        chunkIndex: 0,
        totalChunks: MAX_TOTAL_CHUNKS + 1,
        data: '',
      })
      expect(result.status).toBe('error')
      // A within-cap transfer still starts normally.
      expect(reassembler.accept({ transferId: 't2', chunkIndex: 0, totalChunks: 2, data: 'a' }).status).toBe('pending')
    })

    await it('rejects new transfers past the concurrency cap (partial-buffer leak guard)', async () => {
      const reassembler = new ChunkReassembler<unknown>()
      // Open MAX_CONCURRENT_TRANSFERS distinct, never-completed transfers.
      // t0's two chunks join to valid JSON ('true') so it can complete below.
      expect(reassembler.accept({ transferId: 't0', chunkIndex: 0, totalChunks: 2, data: 'tr' }).status).toBe('pending')
      for (let i = 1; i < MAX_CONCURRENT_TRANSFERS; i++) {
        expect(reassembler.accept({ transferId: `t${i}`, chunkIndex: 0, totalChunks: 2, data: 'a' }).status).toBe(
          'pending',
        )
      }
      // The next NEW transferId is refused…
      expect(reassembler.accept({ transferId: 'overflow', chunkIndex: 0, totalChunks: 2, data: 'a' }).status).toBe(
        'error',
      )
      // …but an already-open transfer still makes progress (and frees a slot).
      expect(reassembler.accept({ transferId: 't0', chunkIndex: 1, totalChunks: 2, data: 'ue' }).status).toBe('done')
    })

    await it('clear() drops partial transfers', async () => {
      const payload = { v: 1 }
      const reassembler = new ChunkReassembler<typeof payload>()
      const chunks = buildChunkEnvelopes('t', JSON.stringify(payload), 4)
      reassembler.accept(chunks[0])
      reassembler.clear()
      // Re-feeding from scratch completes normally (no stale partial state).
      let done = false
      for (const chunk of chunks) {
        if (reassembler.accept(chunk).status === 'done') done = true
      }
      expect(done).toBe(true)
    })
  })
}
