/**
 * End-to-end test for the full collab pipeline over a REAL
 * WebSocket signalling transport.
 *
 * Where `snapshot-exchange.spec.ts` (in @pixelrpg/engine) uses an
 * InMemoryTransport pair, this suite uses the production
 * `startLanHostServer` + `connectLanJoinerTransport` — the same
 * transports the maker uses in real two-instance Pair-Editing.
 *
 * RTCPeerConnection itself stays mocked. The bug-class this suite
 * targets is "what happens when two PeerSession instances try to
 * talk over real WebSocket signalling" — wire-format
 * compatibility, frame ordering, connect timing — not the
 * WebRTC negotiation per se. Real WebRTC needs GStreamer running
 * and a real network, which is heavyweight and out of scope for
 * a unit-test runner.
 *
 * Regression coverage for the 2026-05-30 hand-test bug class:
 * host's `openSession` rejected with an unhandled promise
 * rejection after the joiner connected. The actual error was
 * never logged before #(this PR) added the `.catch`. The shape
 * here exercises the SAME path — joiner connects to a real WS,
 * host's `onPeerConnected` fires, real signalling messages flow.
 *
 * Runs on GJS only because real WebSocket needs `@gjsify/ws`'s
 * Soup backend.
 */

import { describe, expect, it, on } from '@gjsify/unit'
import {
  type ConnectedSessionPair,
  createConnectedSessionPair,
  flushMicrotasks,
  PROJECT_SNAPSHOT_VERSION,
  type ProjectSnapshot,
  type SessionProtocolOp,
  SnapshotExchange,
  isSessionProtocolOp,
} from '@pixelrpg/engine'

import { connectLanJoinerTransport, startLanHostServer } from './lan-signalling.ts'

/**
 * `createConnectedSessionPair` uses InMemoryTransport — fine for
 * protocol-level tests but doesn't catch transport-specific
 * bugs. This helper does the same thing but over REAL
 * WebSockets via `startLanHostServer` + `connectLanJoinerTransport`.
 *
 * NOT exported from @pixelrpg/engine because the WS transports
 * live in the maker package. If a second consumer needs this
 * shape, extract to a shared helper module.
 */
async function createWebSocketSessionPair(): Promise<ConnectedSessionPair & { hostServer: { close(): Promise<void> } }> {
  // 1. Spin up the real WS server. `port: 0` lets the kernel
  //    pick; we read back the bound port for the joiner.
  let hostTransportFromServer: import('@pixelrpg/engine').SignallingTransport | null = null
  const hostServer = await startLanHostServer({
    port: 0,
    onPeerConnected: (t) => {
      hostTransportFromServer = t
    },
  })

  try {
    // 2. Joiner connects over real WS.
    const joinerTransport = await connectLanJoinerTransport(
      hostServer.address.host,
      hostServer.address.port,
    )

    // 3. Wait for the server side to have wired its transport.
    const start = Date.now()
    while (hostTransportFromServer === null && Date.now() - start < 2000) {
      await new Promise<void>((r) => setTimeout(r, 25))
    }
    if (hostTransportFromServer === null) {
      throw new Error('createWebSocketSessionPair: server never observed the joiner connection')
    }

    // 4. Build the two PeerSessions over those real transports.
    // We keep the InMemoryTransport pair AND fake RTCs from
    // createConnectedSessionPair for the WebRTC layer — only the
    // SIGNALLING channel is real here.
    const inmem = await createConnectedSessionPair()
    inmem.close() // discard the in-mem pair; we just wanted the fakes

    // Easier path: don't reuse `createConnectedSessionPair` since
    // it builds its own InMemoryTransports. Build PeerSessions
    // directly, this time wiring our real WS transports.
    const { FakeRTCPeerConnection, rtcFactoryFor, CHANNEL_OP, CHANNEL_AWARENESS, wireChannelDelivery } =
      await import('@pixelrpg/engine')
    const { PeerSession } = await import('@pixelrpg/engine')

    const hostPc = new FakeRTCPeerConnection()
    const joinerPc = new FakeRTCPeerConnection()
    const host = new PeerSession({
      role: 'host',
      signalling: hostTransportFromServer,
      rtcFactory: rtcFactoryFor(hostPc),
    })
    const joiner = new PeerSession({
      role: 'joiner',
      signalling: joinerTransport,
      rtcFactory: rtcFactoryFor(joinerPc),
    })

    await Promise.all([host.connect(), joiner.connect()])
    await flushMicrotasks()
    // Wait one more tick for SDP exchange round-trip over real WS.
    await new Promise<void>((r) => setTimeout(r, 50))

    const hostOpChannel = hostPc.channels.find((c) => c.label === CHANNEL_OP)
    const hostAwarenessChannel = hostPc.channels.find((c) => c.label === CHANNEL_AWARENESS)
    if (!hostOpChannel || !hostAwarenessChannel) {
      throw new Error('createWebSocketSessionPair: host did not create the expected channels')
    }
    const joinerOpChannel = joinerPc.simulateIncomingChannel(CHANNEL_OP)
    const joinerAwarenessChannel = joinerPc.simulateIncomingChannel(CHANNEL_AWARENESS)
    wireChannelDelivery(hostOpChannel, joinerOpChannel)
    wireChannelDelivery(hostAwarenessChannel, joinerAwarenessChannel)
    hostOpChannel.open()
    hostAwarenessChannel.open()
    joinerOpChannel.open()
    joinerAwarenessChannel.open()
    await flushMicrotasks()

    return {
      host,
      joiner,
      hostTransport: hostTransportFromServer as never,
      joinerTransport: joinerTransport as never,
      hostPc,
      joinerPc,
      hostOpChannel,
      hostAwarenessChannel,
      joinerOpChannel,
      joinerAwarenessChannel,
      hostServer,
      close: () => {
        try {
          host.close('test-teardown')
        } catch {}
        try {
          joiner.close('test-teardown')
        } catch {}
      },
    } as ConnectedSessionPair & { hostServer: { close(): Promise<void> } }
  } catch (err) {
    await hostServer.close().catch(() => {})
    throw err
  }
}

const FAKE_SNAPSHOT: ProjectSnapshot = {
  version: PROJECT_SNAPSHOT_VERSION,
  projectFilename: 'game-project.json',
  project: {
    version: '1.0.0',
    id: 'real-ws-shared',
    name: 'Real WS Shared',
    startup: { initialMapId: 'a' },
    spriteSets: [],
    maps: [{ id: 'a', name: 'A', type: 'map', path: 'maps/a.json' }],
  } as unknown as ProjectSnapshot['project'],
  maps: [
    {
      path: 'maps/a.json',
      data: {
        version: '1.0.0',
        id: 'a',
        name: 'A',
        columns: 8,
        rows: 8,
        tileWidth: 16,
        tileHeight: 16,
        layers: [{ id: 'g', name: 'G', type: 'tile', tier: 'background', data: [] }],
        spriteSets: [],
      } as unknown as ProjectSnapshot['maps'][number]['data'],
    },
  ],
  spriteSets: [],
}

function exchangeFor(
  peer: import('@pixelrpg/engine').PeerSession,
  peerId: string,
  captureSnapshot: () => ProjectSnapshot | null,
): SnapshotExchange {
  const exchange = new SnapshotExchange({
    peerId,
    send: (op) => peer.sendOp(op),
    captureSnapshot,
  })
  peer.events.on('op-received', ({ op }: { op: SessionProtocolOp | unknown }) => {
    if (isSessionProtocolOp(op)) exchange.handle(op)
  })
  return exchange
}

export default async () => {
  await on('Gjs', async () => {
    await describe('CollabSession E2E over REAL WebSocket signalling', async () => {
      await it('joiner connects to host and the connection settles in `connected`', async () => {
        const pair = await createWebSocketSessionPair()
        try {
          expect(pair.host.getState()).toBe('connected')
          expect(pair.joiner.getState()).toBe('connected')
        } finally {
          pair.close()
          await pair.hostServer.close()
        }
      })

      await it('snapshot request round-trip works over real WS', async () => {
        const pair = await createWebSocketSessionPair()
        try {
          let captureCount = 0
          const hostExchange = exchangeFor(pair.host, 'host-ws', () => {
            captureCount++
            return FAKE_SNAPSHOT
          })
          const joinerExchange = exchangeFor(pair.joiner, 'joiner-ws', () => null)

          const received = await joinerExchange.request('room-ws', 3_000)

          expect(captureCount).toBe(1)
          expect(received.version).toBe(PROJECT_SNAPSHOT_VERSION)
          expect(received.project.id).toBe('real-ws-shared')

          hostExchange.dispose()
          joinerExchange.dispose()
        } finally {
          pair.close()
          await pair.hostServer.close()
        }
      })

      await it('host close gracefully tears down without unhandled rejection', async () => {
        // Regression for 2026-05-30: host's `openSession` rejected
        // mid-flight when the joiner had connected but the
        // negotiation/snapshot path threw. Pre-#109 the error
        // surfaced as an "Unhandled promise rejection" with no
        // message. Now: if anything in the host flow throws, the
        // `.catch` added in session-service.ts logs it.
        //
        // This test just exercises the close path — proves that
        // closing the host doesn't itself raise an unhandled
        // rejection.
        const pair = await createWebSocketSessionPair()
        try {
          // Force-close the joiner first; host should clean up
          // without throwing.
          pair.joiner.close('test')
          await new Promise<void>((r) => setTimeout(r, 100))
          pair.host.close('test')
        } finally {
          await pair.hostServer.close()
        }
      })
    })
  })
}
