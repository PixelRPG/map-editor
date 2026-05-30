/**
 * End-to-end integration test for the snapshot-exchange flow.
 *
 * Drives the full path against `createConnectedSessionPair`:
 *
 *    host SessionController + SnapshotExchange ↔ FakeRTCPeerConnection
 *      ↑ ↓ wire (cross-wired data channels)
 *    joiner SessionController + SnapshotExchange ↔ FakeRTCPeerConnection
 *
 * The actual `Engine` is replaced with a tiny duck-typed stub so
 * the test doesn't need to boot Excalibur (heavy + irrelevant to
 * the protocol). The protocol primitives (request/response
 * envelopes, controller filter, exchange state machine) are all
 * real.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { Engine } from '../engine.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { EventEmitter } from 'excalibur'

import { createConnectedSessionPair, flushMicrotasks } from './in-memory-transport.ts'
import { PROJECT_SNAPSHOT_VERSION, type ProjectSnapshot } from './project-snapshot.ts'
import { SessionController } from './session-controller.ts'
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
 * Minimal Engine stand-in. SessionController only touches
 * `events.on(EngineEvent.COMMAND_EXECUTED)` + `applyRemoteCommand`
 * — and for this protocol test neither path fires.
 */
function makeFakeEngine(): Engine {
  return {
    events: new EventEmitter<EngineEventMap>(),
    applyRemoteCommand: () => {},
  } as unknown as Engine
}

export default async () => {
  await describe('SnapshotExchange — request / respond over a connected pair', async () => {
    await it('host receives the joiner request and sends back its captured snapshot', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostEngine = makeFakeEngine()
        const joinerEngine = makeFakeEngine()

        let captureCount = 0
        const hostController = new SessionController({
          engine: hostEngine,
          session: sessions.host,
          peerId: 'host-1',
          onSessionProtocol: (op) => hostExchange.handle(op),
        })
        const hostExchange = new SnapshotExchange({
          controller: hostController,
          captureSnapshot: () => {
            captureCount++
            return FAKE_SNAPSHOT
          },
        })

        const joinerController = new SessionController({
          engine: joinerEngine,
          session: sessions.joiner,
          peerId: 'joiner-1',
          onSessionProtocol: (op) => joinerExchange.handle(op),
        })
        const joinerExchange = new SnapshotExchange({
          controller: joinerController,
          captureSnapshot: () => null, // joiner doesn't host its own snapshot
        })

        const received = await joinerExchange.request('room-abc', 2_000)

        expect(captureCount).toBe(1)
        expect(received.version).toBe(PROJECT_SNAPSHOT_VERSION)
        expect(received.project.id).toBe('shared')
        expect(received.maps.length).toBe(1)
        expect(received.maps[0].path).toBe('maps/dungeon.json')

        hostExchange.dispose()
        joinerExchange.dispose()
        hostController.close()
        joinerController.close()
      } finally {
        sessions.close()
      }
    })

    await it('joiner times out when the host refuses (captureSnapshot returns null)', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostEngine = makeFakeEngine()
        const joinerEngine = makeFakeEngine()

        const hostController = new SessionController({
          engine: hostEngine,
          session: sessions.host,
          peerId: 'host-2',
          onSessionProtocol: (op) => hostExchange.handle(op),
        })
        const hostExchange = new SnapshotExchange({
          controller: hostController,
          captureSnapshot: () => null,
        })

        const joinerController = new SessionController({
          engine: joinerEngine,
          session: sessions.joiner,
          peerId: 'joiner-2',
          onSessionProtocol: (op) => joinerExchange.handle(op),
        })
        const joinerExchange = new SnapshotExchange({
          controller: joinerController,
          captureSnapshot: () => null,
        })

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
        hostController.close()
        joinerController.close()
      } finally {
        sessions.close()
      }
    })

    await it('rejects a second request while the first is in flight', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostController = new SessionController({
          engine: makeFakeEngine(),
          session: sessions.host,
          peerId: 'host-3',
        })
        // No-op host exchange so the joiner request never resolves.
        const joinerController = new SessionController({
          engine: makeFakeEngine(),
          session: sessions.joiner,
          peerId: 'joiner-3',
          onSessionProtocol: (op) => joinerExchange.handle(op),
        })
        const joinerExchange = new SnapshotExchange({
          controller: joinerController,
          captureSnapshot: () => null,
        })

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

        hostController.close()
        joinerController.close()
      } finally {
        sessions.close()
      }
    })

    await it('dispose cancels in-flight requests', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostController = new SessionController({
          engine: makeFakeEngine(),
          session: sessions.host,
          peerId: 'host-4',
        })
        const joinerController = new SessionController({
          engine: makeFakeEngine(),
          session: sessions.joiner,
          peerId: 'joiner-4',
          onSessionProtocol: (op) => joinerExchange.handle(op),
        })
        const joinerExchange = new SnapshotExchange({
          controller: joinerController,
          captureSnapshot: () => null,
        })

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

        hostController.close()
        joinerController.close()
      } finally {
        sessions.close()
      }
    })
  })

  await describe('SessionController.onSessionProtocol — protocol routing', async () => {
    await it('routes a session-protocol op to the hook instead of the command registry', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostEngine = makeFakeEngine()
        let commandsApplied = 0
        // Spy: count command apply calls so we can prove the protocol hook DIDN'T trigger one.
        hostEngine.applyRemoteCommand = () => {
          commandsApplied++
        }
        const protocolReceived: unknown[] = []
        const hostController = new SessionController({
          engine: hostEngine,
          session: sessions.host,
          peerId: 'host-5',
          onSessionProtocol: (op) => protocolReceived.push(op),
        })
        // Joiner-side controller exists only as a sender.
        const joinerController = new SessionController({
          engine: makeFakeEngine(),
          session: sessions.joiner,
          peerId: 'joiner-5',
        })

        joinerController.sendSessionProtocol({
          kind: '__session/snapshot-request',
          payload: { roomId: 'room' },
        } as unknown as Parameters<typeof joinerController.sendSessionProtocol>[0])

        await flushMicrotasks()

        expect(protocolReceived.length).toBe(1)
        expect(commandsApplied).toBe(0)

        hostController.close()
        joinerController.close()
      } finally {
        sessions.close()
      }
    })
  })
}
