/**
 * End-to-end test that mimics the actual two-instance Pair-Editing
 * hand-test in process: one host SessionService starts hosting,
 * another joiner SessionService joins via real LAN signalling
 * (WebSocketServer + WebSocket on loopback), the host streams its
 * snapshot, the joiner writes it to sandbox, both reach
 * `awaiting-engine` / `connected`.
 *
 * What's real here:
 *   - Both SessionService instances (the same class the maker uses)
 *   - LAN signalling: `startLanHostServer` + `connectLanJoinerTransport`
 *     (real WebSocket, in-process, exercises @gjsify/ws over Soup)
 *   - SnapshotExchange: real op-channel round-trip
 *   - `writeSnapshotToSandbox`: real disk I/O into a per-roomId dir
 *     under `$XDG_DATA_HOME/pixelrpg-maker/shared/`
 *   - Engine attach handshake (`attachEngineToCurrentSession`)
 *
 * What's faked here:
 *   - `RTCPeerConnection` — replaced with `FakeRTCPeerConnection`
 *     pairs wired via `wireChannelDelivery`. Real GStreamer
 *     webrtcbin is heavyweight to spin up in a test (needs
 *     `gst-plugins-bad` runtime + ICE infra) and the SessionService
 *     orchestration we're testing here doesn't depend on the
 *     specific transport — only on the data channels actually
 *     carrying frames in both directions.
 *   - `Engine` on the host — a stub that returns a deterministic
 *     `ProjectSnapshot` from `captureProjectSnapshot`. The joiner
 *     also gets an engine stub for the post-snapshot attach step.
 *
 * Regression coverage:
 *   - Pre-fix #110/#111/#112/#113/#114/#115/#116 + gjsify#426 + #427
 *     the joiner-side flow timed out before `state=connected`. THIS
 *     test exercises the entire flow through to
 *     `state=awaiting-engine`, then `attachEngineToCurrentSession`
 *     → `state=connected`. A regression that breaks any layer
 *     fails here loudly.
 *   - The `bye: join-failed` path from the 2026-05-31 hand-test
 *     surfaces in `requestSnapshot` or `writeSnapshotToSandbox`.
 *     Both are exercised end-to-end so any regression in that
 *     pipeline surfaces here.
 */

import { describe, expect, it, on } from '@gjsify/unit'
import {
  CHANNEL_AWARENESS,
  CHANNEL_OP,
  type Engine,
  FakeRTCPeerConnection,
  flushMicrotasks,
  PROJECT_SNAPSHOT_VERSION,
  type ProjectSnapshot,
  rtcFactoryFor,
  wireChannelDelivery,
} from '@pixelrpg/engine'

import { connectLanJoinerTransport, startLanHostServer } from './lan-signalling.ts'
import type { DiscoveredService, LanDiscoveryEvent } from './lan-discovery-parse.ts'
import {
  type HostingHandle,
  type HostingOptions,
  type SessionBackend,
  SessionService,
} from './session-service.ts'

const FAKE_SNAPSHOT: ProjectSnapshot = {
  version: PROJECT_SNAPSHOT_VERSION,
  projectFilename: 'game-project.json',
  project: {
    version: '1.0.0',
    id: 'e2e-shared',
    name: 'E2E Shared Project',
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
}

/**
 * Engine stub matching the surface `captureProjectSnapshot` +
 * `CollabSession.attachEngine` actually touch:
 *
 *   - `engine.gameProjectResource.data` → the project JSON
 *   - `engine.gameProjectResource.getMapResource(id).mapData` →
 *     each map's data
 *   - `engine.events.on(...)` → event subscription (returns
 *     `{ close }`)
 *   - `engine.onPointerMoved(cb)` → returns a disposer; called by
 *     CollabSession.attachEngine to wire local-cursor broadcast
 *   - `engine.scenes` / `engine.currentScene` etc. — touched by
 *     `RemoteCursorRenderer` and `SessionController`. We stub
 *     enough for them to construct without throwing.
 *
 * The shape is duck-typed via `as unknown as Engine` so adding a
 * new field to the real engine surface only requires updating the
 * stub when that field is actually used in the join flow.
 */
function makeHostEngineStub(): Engine {
  return {
    events: {
      on() {
        return { close() {} }
      },
    },
    gameProjectResource: {
      data: FAKE_SNAPSHOT.project,
      getMapResource(id: string) {
        const entry = FAKE_SNAPSHOT.maps.find((m) => m.path.endsWith(`${id}.json`))
        return entry ? { mapData: entry.data } : null
      },
    },
    onPointerMoved(_cb: unknown) {
      return () => {
        /* no-op disposer */
      }
    },
    scenes: new Map(),
    currentScene: null,
    applyRemoteCommand() {
      /* no-op */
    },
  } as unknown as Engine
}

/** Joiner-side engine stub used only for the post-snapshot attach step. */
function makeJoinerEngineStub(): Engine {
  return {
    events: {
      on() {
        return { close() {} }
      },
    },
    onPointerMoved(_cb: unknown) {
      return () => {
        /* no-op disposer */
      }
    },
    scenes: new Map(),
    currentScene: null,
    applyRemoteCommand() {
      /* no-op */
    },
  } as unknown as Engine
}

/**
 * Real-LAN-signalling SessionBackend that uses the production
 * `startLanHostServer` + `connectLanJoinerTransport`. Tests
 * construct two of these (one per SessionService instance) and
 * link them via the joiner-side `connectLan` pointing at the
 * host's bound port.
 */
class LanLoopbackBackend implements SessionBackend {
  private hostHandle: { close(): Promise<void>; port: number; peerCallbacks: Array<(t: import('@pixelrpg/engine').SignallingTransport) => void> } | null = null
  private discoveryListeners = new Set<(event: LanDiscoveryEvent) => void>()
  private peerOf: LanLoopbackBackend | null = null

  /** Mock LAN browse — fed manually by `simulateDiscovery`. */
  startBrowsing(onEvent: (event: LanDiscoveryEvent) => void): void {
    this.discoveryListeners.add(onEvent)
  }

  stopBrowsing(): void {
    this.discoveryListeners.clear()
  }

  /**
   * Mimic Avahi's `resolved` discovery for a peer that's hosting
   * on `host:port`. Tests call this once the host's
   * `startHosting` promise resolves so the joiner can pick it up
   * via `joinByRoomId`'s LAN-shortcut cache.
   */
  simulateDiscovery(service: DiscoveredService): void {
    for (const listener of this.discoveryListeners) listener({ kind: 'resolved', service })
  }

  async startHosting(opts: HostingOptions): Promise<HostingHandle> {
    const peerCallbacks: Array<(t: import('@pixelrpg/engine').SignallingTransport) => void> = []
    const server = await startLanHostServer({
      port: 0,
      host: '127.0.0.1',
      onPeerConnected: (transport) => {
        for (const cb of peerCallbacks) cb(transport)
      },
    })
    this.hostHandle = {
      port: server.address.port,
      peerCallbacks,
      close: () => server.close(),
    }
    return {
      port: server.address.port,
      onPeerConnected: (cb) => {
        peerCallbacks.push(cb)
      },
      close: async () => {
        const handle = this.hostHandle
        this.hostHandle = null
        if (handle) await handle.close()
        void opts
      },
    }
  }

  async connectLan(host: string, port: number): Promise<import('@pixelrpg/engine').SignallingTransport> {
    return connectLanJoinerTransport(host, port)
  }

  async connectRelay(): Promise<import('@pixelrpg/engine').SignallingTransport> {
    throw new Error('LanLoopbackBackend: relay path not wired in tests')
  }
}

interface PairedRtcs {
  hostPc: FakeRTCPeerConnection
  joinerPc: FakeRTCPeerConnection
  /** Wire both sides' data channels — must run AFTER host has called createDataChannel. */
  wireChannels(): void
}

/**
 * Build two paired FakeRTCPeerConnections so the host's "op" /
 * "awareness" channels deliver to the joiner's `ondatachannel`-
 * provisioned channels and vice-versa. Each test gets a fresh
 * pair; the factories returned wrap the right pc for each side
 * so SessionService → CollabSession → PeerSession constructs the
 * exact instance we control.
 */
function newPairedRtcs(): {
  hostFactory: ReturnType<typeof rtcFactoryFor>
  joinerFactory: ReturnType<typeof rtcFactoryFor>
  paired: PairedRtcs
} {
  const hostPc = new FakeRTCPeerConnection()
  const joinerPc = new FakeRTCPeerConnection()
  return {
    hostFactory: rtcFactoryFor(hostPc),
    joinerFactory: rtcFactoryFor(joinerPc),
    paired: {
      hostPc,
      joinerPc,
      wireChannels() {
        const hostOp = hostPc.channels.find((c) => c.label === CHANNEL_OP)
        const hostAwareness = hostPc.channels.find((c) => c.label === CHANNEL_AWARENESS)
        if (!hostOp || !hostAwareness) {
          throw new Error('paired-rtc: host has not created its data channels yet')
        }
        const joinerOp = joinerPc.simulateIncomingChannel(CHANNEL_OP)
        const joinerAwareness = joinerPc.simulateIncomingChannel(CHANNEL_AWARENESS)
        wireChannelDelivery(hostOp, joinerOp)
        wireChannelDelivery(hostAwareness, joinerAwareness)
        hostOp.open()
        hostAwareness.open()
        joinerOp.open()
        joinerAwareness.open()
      },
    },
  }
}

export default async () => {
  await on('Gjs', async () => {
    await describe('SessionService E2E (host startHosting + joiner joinByRoomId, real LAN signalling)', async () => {
      await it('completes the full join flow — snapshot arrives, sandbox is written, state reaches awaiting-engine then connected', async () => {
        // — Set up paired RTC factories so the data channels actually
        //   carry frames between host and joiner (FakeRTCPeerConnection's
        //   are otherwise islands).
        const { hostFactory, joinerFactory, paired } = newPairedRtcs()

        // — Host SessionService with real engine stub + LAN backend
        const hostBackend = new LanLoopbackBackend()
        const host = new SessionService(
          () => makeHostEngineStub(),
          hostBackend,
          'host-peer',
          1_000,
          2_000,
          hostFactory,
        )

        // — Joiner SessionService WITHOUT engine (the sandbox flow attaches it later)
        const joinerBackend = new LanLoopbackBackend()
        const joiner = new SessionService(
          () => null,
          joinerBackend,
          'joiner-peer',
          1_000,
          2_000,
          joinerFactory,
        )

        // — Host starts hosting
        const roomId = await host.startHosting({
          sessionName: 'E2E',
          projectName: 'E2E Project',
          hostDisplayName: 'host-peer',
        })
        expect(host.getState().kind).toBe('hosting')
        const hostAddr = '127.0.0.1'
        const hostPort = (host.getState() as { kind: 'hosting'; port: number }).port

        // — Joiner starts browsing + receives a faked LAN-discovery
        //   event pointing at the host's bound port, so
        //   `joinByRoomId(roomId)` short-circuits through the LAN path
        joiner.startBrowsing()
        joinerBackend.simulateDiscovery({
          name: 'e2e-host',
          host: 'localhost',
          address: hostAddr,
          port: hostPort,
          txt: { room: roomId, project: 'E2E Project' } as DiscoveredService['txt'],
        })

        // — Wire the channels AFTER joiner connects (host creates them
        //   in its CollabSession constructor on `onPeerConnected`). We
        //   piggyback on the discovery listener: the joiner will call
        //   `connectLan` → host's onPeerConnected → CollabSession host
        //   constructor runs → channels exist. Then we wire delivery.
        const sandboxReady = new Promise<{
          roomId: string
          sandboxProjectPath: string
        }>((resolve) => {
          joiner.on('sandbox-project-ready', (payload) => resolve(payload))
        })

        // Capture any session-service errors so test failures surface
        // with the underlying cause instead of just a hang.
        const errors: Error[] = []
        joiner.on('error', (err) => errors.push(err))
        host.on('error', (err) => errors.push(err))

        // Start the join — completes asynchronously (peer.connect +
        // snapshot round-trip). We DELAY the channel wiring just long
        // enough for both CollabSessions to construct.
        const joinPromise = joiner.joinByRoomId(roomId)

        // Two microtask drains + a short delay so both peer sessions
        // are constructed and have created their channels.
        await flushMicrotasks()
        await new Promise<void>((r) => setTimeout(r, 50))
        paired.wireChannels()

        // Awareness announce + snapshot exchange should now flow.
        await joinPromise
        const payload = await sandboxReady

        // — Verify sandbox was written
        expect(payload.roomId).toBe(roomId)
        expect(payload.sandboxProjectPath).toContain('/pixelrpg-maker/shared/')
        expect(payload.sandboxProjectPath).toContain(roomId)
        expect(payload.sandboxProjectPath.endsWith('game-project.json')).toBe(true)

        // — Joiner state should be awaiting-engine; host should be connected
        expect(joiner.getState().kind).toBe('awaiting-engine')
        expect(host.getState().kind).toBe('connected')

        // — No errors surfaced on either side
        if (errors.length > 0) {
          throw new Error(
            `session-service e2e: ${errors.length} error(s) surfaced: ${errors.map((e) => e.message).join(' | ')}`,
          )
        }

        // — Attach engine on joiner — should transition to `connected`
        joiner.attachEngineToCurrentSession(makeJoinerEngineStub())
        expect(joiner.getState().kind).toBe('connected')

        // — Tear down cleanly
        await joiner.leaveSession('e2e-done')
        await host.leaveSession('e2e-done')
      })
    })
  })
}
