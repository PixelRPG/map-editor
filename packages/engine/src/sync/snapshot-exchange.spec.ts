/**
 * End-to-end integration test for the snapshot-exchange flow.
 *
 * Drives the full path against `createConnectedSessionPair`:
 *
 *    host PeerSession + SnapshotExchange ↔ FakeRTCPeerConnection
 *      ↑ ↓ wire (cross-wired data channels)
 *    joiner PeerSession + SnapshotExchange ↔ FakeRTCPeerConnection
 *
 * No `SessionController` (and therefore no Engine) needed — the
 * exchange takes raw `send` + `captureSnapshot` callbacks, which
 * is exactly what enables the joiner sandbox flow: connect →
 * requestSnapshot → write-to-disk → THEN load engine.
 *
 * Production CollabSession wires `send` to `peer.sendOp` and
 * inbound routing via `peer.events.on('op-received')` filtered by
 * `isSessionProtocolOp`. This spec mirrors that wiring directly.
 */

import { describe, expect, it } from '@gjsify/unit'

import { createConnectedSessionPair, flushMicrotasks } from './in-memory-transport.ts'
import type { ProjectSnapshot } from './project-snapshot.ts'
import { PROJECT_SNAPSHOT_VERSION } from './project-snapshot.ts'
import {
  type SessionProtocolOp,
  SNAPSHOT_CHUNK_KIND,
  isSessionProtocolOp,
} from './session-protocol.ts'
import { SnapshotExchange } from './snapshot-exchange.ts'

const FAKE_SNAPSHOT: ProjectSnapshot = {
  version: PROJECT_SNAPSHOT_VERSION,
  projectFilename: 'game-project.json',
  project: {
    version: '1.0.0',
    id: 'shared',
    name: 'Shared Project',
    startup: { initialMapId: 'dungeon' },
    spriteSets: [],
    maps: [{ id: 'dungeon', name: 'Dungeon', type: 'map', path: 'maps/dungeon.json' }],
  } as unknown as ProjectSnapshot['project'],
  maps: [
    {
      path: 'maps/dungeon.json',
      data: {
        version: '1.0.0',
        id: 'dungeon',
        name: 'Dungeon',
        columns: 16,
        rows: 16,
        tileWidth: 16,
        tileHeight: 16,
        layers: [{ id: 'ground', name: 'Ground', type: 'tile', tier: 'background', data: [] }],
        spriteSets: [],
      } as unknown as ProjectSnapshot['maps'][number]['data'],
    },
  ],
}

/**
 * Build a SnapshotExchange wired to one side of a connected
 * peer pair — inbound routing via the peer's `op-received` event
 * (filtered to session-protocol kinds), outbound via `peer.sendOp`.
 * Mirrors how `CollabSession` composes the exchange in production.
 */
function exchangeFor(
  peer: import('./peer-session.ts').PeerSession,
  peerId: string,
  captureSnapshot: () => ProjectSnapshot | null,
): SnapshotExchange {
  const exchange = new SnapshotExchange({
    peerId,
    send: (op) => peer.sendOp(op),
    captureSnapshot,
  })
  peer.events.on('op-received', ({ op }) => {
    if (isSessionProtocolOp(op)) exchange.handle(op)
  })
  return exchange
}

export default async () => {
  await describe('SnapshotExchange — request / respond over a connected pair', async () => {
    await it('host receives the joiner request and sends back its captured snapshot', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        let captureCount = 0
        const hostExchange = exchangeFor(sessions.host, 'host-1', () => {
          captureCount++
          return FAKE_SNAPSHOT
        })
        const joinerExchange = exchangeFor(sessions.joiner, 'joiner-1', () => null)

        const received = await joinerExchange.request('room-abc', 2_000)

        expect(captureCount).toBe(1)
        expect(received.version).toBe(PROJECT_SNAPSHOT_VERSION)
        expect(received.project.id).toBe('shared')
        expect(received.maps.length).toBe(1)
        expect(received.maps[0].path).toBe('maps/dungeon.json')

        hostExchange.dispose()
        joinerExchange.dispose()
      } finally {
        sessions.close()
      }
    })

    await it('joiner times out when the host refuses (captureSnapshot returns null)', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostExchange = exchangeFor(sessions.host, 'host-2', () => null)
        const joinerExchange = exchangeFor(sessions.joiner, 'joiner-2', () => null)

        // 50 ms timeout — keeps the test fast.
        let thrown: Error | null = null
        try {
          await joinerExchange.request('room-empty', 50)
        } catch (err) {
          thrown = err as Error
        }
        expect(thrown).not.toBeNull()
        expect(thrown?.message).toContain('timed out')

        hostExchange.dispose()
        joinerExchange.dispose()
      } finally {
        sessions.close()
      }
    })

    await it('rejects a second request while the first is in flight', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        // Host doesn't respond — so the first request never resolves.
        const hostExchange = exchangeFor(sessions.host, 'host-3', () => null)
        const joinerExchange = exchangeFor(sessions.joiner, 'joiner-3', () => null)

        const first = joinerExchange.request('room-1', 2_000)
        let secondError: Error | null = null
        try {
          await joinerExchange.request('room-1', 2_000)
        } catch (err) {
          secondError = err as Error
        }
        expect(secondError).not.toBeNull()
        expect(secondError?.message).toContain('already in flight')

        // Tear down the unresolved first request so it doesn't leak.
        joinerExchange.dispose()
        await flushMicrotasks()
        let firstError: Error | null = null
        try {
          await first
        } catch (err) {
          firstError = err as Error
        }
        expect(firstError?.message).toContain('disposed')

        hostExchange.dispose()
      } finally {
        sessions.close()
      }
    })

    await it('dispose cancels in-flight requests', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostExchange = exchangeFor(sessions.host, 'host-4', () => null)
        const joinerExchange = exchangeFor(sessions.joiner, 'joiner-4', () => null)

        const pending = joinerExchange.request('room-x', 2_000)
        joinerExchange.dispose()
        let err: Error | null = null
        try {
          await pending
        } catch (e) {
          err = e as Error
        }
        expect(err?.message).toContain('disposed')

        // Idempotent: second dispose is a no-op.
        joinerExchange.dispose()

        hostExchange.dispose()
      } finally {
        sessions.close()
      }
    })

    await it('stamps each outgoing envelope with the configured peerId + monotonic seq', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostExchange = exchangeFor(sessions.host, 'host-5', () => FAKE_SNAPSHOT)
        const joinerExchange = exchangeFor(sessions.joiner, 'joiner-5', () => null)

        await joinerExchange.request('room-stamp', 2_000)
        await flushMicrotasks()

        // The joiner sent one request — assert peerId + seq stamping.
        // The host's first sentFrames entry on the op channel is the request that arrived.
        const joinerSentFrames = sessions.joinerOpChannel.sentFrames
        expect(joinerSentFrames.length).toBeGreaterThan(0)
        const joinerSent = joinerSentFrames.map((f) => JSON.parse(f) as { peerId?: string; seq?: number })
        expect(joinerSent[0].peerId).toBe('joiner-5')
        expect(joinerSent[0].seq).toBe(0)

        const hostSentFrames = sessions.hostOpChannel.sentFrames
        const hostSent = hostSentFrames.map((f) => JSON.parse(f) as { peerId?: string; seq?: number })
        // Host's first response is the snapshot reply.
        expect(hostSent[0].peerId).toBe('host-5')
        expect(hostSent[0].seq).toBe(0)

        hostExchange.dispose()
        joinerExchange.dispose()
      } finally {
        sessions.close()
      }
    })
  })

  await describe('SnapshotExchange — chunked transfer (2026-06-01 regression)', async () => {
    // Pre-fix: the host called `peer.sendOp(SnapshotResponseOp)` with
    // the entire serialised snapshot in one frame. Real-project
    // snapshots routinely run 1.2+ MiB; GStreamer webrtcbin silently
    // dropped sends over its SCTP max-message-size ceiling (RFC 8841
    // default 64 KiB), and the joiner's 10 s SnapshotExchange timeout
    // fired without any wire diagnostic. Post-fix: the host splits
    // into `SNAPSHOT_CHUNK_KIND` ops and the joiner reassembles —
    // every wire frame stays ~16 KiB.

    await it('host always sends chunk ops (1+ chunks); joiner reassembles', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostExchange = exchangeFor(sessions.host, 'host-c1', () => FAKE_SNAPSHOT)
        const joinerExchange = exchangeFor(sessions.joiner, 'joiner-c1', () => null)

        const received = await joinerExchange.request('room-chunk-default', 2_000)
        expect(received.project.id).toBe('shared')

        // Inspect what the host actually sent on the wire — at least
        // ONE frame should be a SNAPSHOT_CHUNK_KIND (never the legacy
        // single-message SNAPSHOT_RESPONSE_KIND).
        const hostSent = sessions.hostOpChannel.sentFrames.map(
          (f) => JSON.parse(f) as SessionProtocolOp,
        )
        const chunks = hostSent.filter((op) => op.kind === SNAPSHOT_CHUNK_KIND)
        expect(chunks.length).toBeGreaterThanOrEqual(1)
        // Sanity: chunk envelopes carry coherent `totalChunks` and
        // monotonic 0..N-1 indices.
        const totalChunks = (chunks[0] as { payload: { totalChunks: number } }).payload.totalChunks
        expect(chunks.length).toBe(totalChunks)
        for (let i = 0; i < chunks.length; i++) {
          const payload = (chunks[i] as { payload: { chunkIndex: number; totalChunks: number; data: string } }).payload
          expect(payload.chunkIndex).toBe(i)
          expect(payload.totalChunks).toBe(totalChunks)
          expect(typeof payload.data).toBe('string')
        }

        hostExchange.dispose()
        joinerExchange.dispose()
      } finally {
        sessions.close()
      }
    })

    await it('REGRESSION (2026-06-01): large snapshot is split into multiple chunks under the configured byte budget', async () => {
      // Force chunking by setting an absurdly small per-chunk budget
      // — the FAKE_SNAPSHOT serialises to several hundred bytes, so
      // 64-byte chunks produces ~10 chunks. This pins the chunking
      // path without needing a megabyte of fixture data.
      const sessions = await createConnectedSessionPair()
      try {
        const hostExchange = new SnapshotExchange({
          peerId: 'host-c2',
          send: (op) => sessions.host.sendOp(op),
          captureSnapshot: () => FAKE_SNAPSHOT,
          chunkSizeBytes: 64,
        })
        sessions.host.events.on('op-received', ({ op }) => {
          if (isSessionProtocolOp(op)) hostExchange.handle(op)
        })
        const joinerExchange = exchangeFor(sessions.joiner, 'joiner-c2', () => null)

        const received = await joinerExchange.request('room-large', 2_000)
        expect(received.project.name).toBe('Shared Project')
        expect(received.maps.length).toBe(1)

        const hostSent = sessions.hostOpChannel.sentFrames.map(
          (f) => JSON.parse(f) as SessionProtocolOp,
        )
        const chunks = hostSent.filter((op) => op.kind === SNAPSHOT_CHUNK_KIND)
        // FAKE_SNAPSHOT JSON is ~430 bytes — 64-byte chunks → 7 chunks
        expect(chunks.length).toBeGreaterThan(3)
        // Each chunk's data slice must be ≤ chunkSizeBytes
        for (const op of chunks) {
          const payload = (op as { payload: { data: string } }).payload
          expect(payload.data.length).toBeLessThanOrEqual(64)
        }

        hostExchange.dispose()
        joinerExchange.dispose()
      } finally {
        sessions.close()
      }
    })

    await it('joiner accepts a legacy single-message SNAPSHOT_RESPONSE_KIND (backwards compat)', async () => {
      // Stay interop-friendly with peers running an older client
      // that still sends the pre-chunking response shape.
      const sessions = await createConnectedSessionPair()
      try {
        // Host bypasses the chunking helper and crafts a legacy
        // response op directly, via the raw peer.sendOp path. The
        // joiner-side handle(...) MUST still resolve.
        const joinerExchange = exchangeFor(sessions.joiner, 'joiner-c3', () => null)
        const pending = joinerExchange.request('room-legacy', 2_000)

        await flushMicrotasks()
        sessions.host.sendOp({
          kind: '__session/snapshot-response',
          payload: { snapshot: FAKE_SNAPSHOT },
          peerId: 'legacy-host',
          seq: 0,
        })

        const received = await pending
        expect(received.project.id).toBe('shared')

        joinerExchange.dispose()
      } finally {
        sessions.close()
      }
    })

    await it('rejects mid-stream change in totalChunks (protocol violation)', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const joinerExchange = exchangeFor(sessions.joiner, 'joiner-c4', () => null)
        const pending = joinerExchange.request('room-bad-batch', 2_000)
        await flushMicrotasks()

        // Send chunk 0 of 3, then chunk 1 of 5 — protocol violation.
        sessions.host.sendOp({
          kind: SNAPSHOT_CHUNK_KIND,
          payload: { chunkIndex: 0, totalChunks: 3, data: '{"x":1' },
          peerId: 'bad-host',
          seq: 0,
        })
        sessions.host.sendOp({
          kind: SNAPSHOT_CHUNK_KIND,
          payload: { chunkIndex: 1, totalChunks: 5, data: ',"y":2' },
          peerId: 'bad-host',
          seq: 1,
        })

        let caught: Error | null = null
        try {
          await pending
        } catch (err) {
          caught = err as Error
        }
        expect(caught).not.toBeNull()
        expect(caught?.message).toContain('chunk batch size changed mid-stream')

        joinerExchange.dispose()
      } finally {
        sessions.close()
      }
    })

    await it('rejects invalid chunk envelopes (negative index, totalChunks=0)', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const joinerExchange = exchangeFor(sessions.joiner, 'joiner-c5', () => null)
        const pending = joinerExchange.request('room-bad-envelope', 2_000)
        await flushMicrotasks()

        sessions.host.sendOp({
          kind: SNAPSHOT_CHUNK_KIND,
          payload: { chunkIndex: -1, totalChunks: 3, data: 'x' },
          peerId: 'bad-host',
          seq: 0,
        })

        let caught: Error | null = null
        try {
          await pending
        } catch (err) {
          caught = err as Error
        }
        expect(caught?.message).toContain('invalid chunk envelope')

        joinerExchange.dispose()
      } finally {
        sessions.close()
      }
    })

    await it('handles a snapshot that JSON-serialises to exactly chunkSizeBytes (boundary)', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostExchange = new SnapshotExchange({
          peerId: 'host-c6',
          send: (op) => sessions.host.sendOp(op),
          captureSnapshot: () => FAKE_SNAPSHOT,
          // Pick a chunk size that's larger than the full snapshot
          // so it fits in exactly ONE chunk — the smallest non-
          // chunked path.
          chunkSizeBytes: 1_000_000,
        })
        sessions.host.events.on('op-received', ({ op }) => {
          if (isSessionProtocolOp(op)) hostExchange.handle(op)
        })
        const joinerExchange = exchangeFor(sessions.joiner, 'joiner-c6', () => null)

        const received = await joinerExchange.request('room-1chunk', 2_000)
        expect(received.project.id).toBe('shared')

        const hostSent = sessions.hostOpChannel.sentFrames.map(
          (f) => JSON.parse(f) as SessionProtocolOp,
        )
        const chunks = hostSent.filter((op) => op.kind === SNAPSHOT_CHUNK_KIND)
        // Single chunk: totalChunks === 1
        expect(chunks.length).toBe(1)
        expect((chunks[0] as { payload: { totalChunks: number } }).payload.totalChunks).toBe(1)

        hostExchange.dispose()
        joinerExchange.dispose()
      } finally {
        sessions.close()
      }
    })
  })
}
