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
import { isSessionProtocolOp } from './session-protocol.ts'
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
}
