import { describe, expect, it } from '@gjsify/unit'

import type { Engine, SignallingMessage, SignallingTransport } from '@pixelrpg/engine'
import { generatePeerId, type HostingHandle, type SessionBackend, SessionService, type SessionState } from './session-service.ts'
import type { LanDiscoveryEvent } from './lan-discovery-parse.ts'

class MockTransport implements SignallingTransport {
  public closed = false
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  send(_msg: SignallingMessage): void {
    /* no-op */
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onMessage(_handler: (msg: SignallingMessage) => void): void {
    /* no-op */
  }
  close(): void {
    this.closed = true
  }
}

class MockBackend implements SessionBackend {
  public browsing = false
  public hostingArgs: { roomId: string; sessionName: string; projectName: string; hostDisplayName: string } | null = null
  public lanConnectArgs: { host: string; port: number } | null = null
  public relayConnectArgs: { roomId: string; role: 'host' | 'joiner' } | null = null
  public browseListener: ((event: LanDiscoveryEvent) => void) | null = null
  public peerCallbacks: Array<(transport: SignallingTransport) => void> = []
  public lanConnectMock: () => Promise<SignallingTransport> = async () => new MockTransport()
  public relayConnectMock: () => Promise<SignallingTransport> = async () => new MockTransport()
  public hostingPort = 8089

  startBrowsing(onEvent: (event: LanDiscoveryEvent) => void): void {
    this.browsing = true
    this.browseListener = onEvent
  }
  stopBrowsing(): void {
    this.browsing = false
    this.browseListener = null
  }
  async startHosting(opts: {
    roomId: string
    sessionName: string
    projectName: string
    hostDisplayName: string
  }): Promise<HostingHandle> {
    this.hostingArgs = opts
    const handle: HostingHandle = {
      port: this.hostingPort,
      onPeerConnected: (cb) => this.peerCallbacks.push(cb),
      close: async () => {
        this.hostingArgs = null
        this.peerCallbacks = []
      },
    }
    return handle
  }
  async connectLan(host: string, port: number): Promise<SignallingTransport> {
    this.lanConnectArgs = { host, port }
    return this.lanConnectMock()
  }
  async connectRelay(roomId: string, role: 'host' | 'joiner'): Promise<SignallingTransport> {
    this.relayConnectArgs = { roomId, role }
    return this.relayConnectMock()
  }
}

// Engine + CollabSession internals are out of scope; only the
// surface the SessionService touches is mocked here. The real
// engine + WebRTC integration is the manual maker smoke.
function makeEngineStub(): Engine {
  return {
    events: {
      on() {
        return { close() {} }
      },
    },
    applyRemoteCommand() {
      /* no-op */
    },
  } as unknown as Engine
}

export default async () => {
  await describe('SessionService — state machine', async () => {
    await it('starts in idle', async () => {
      const service = new SessionService(() => makeEngineStub(), new MockBackend(), 'peer-test')
      expect(service.getState().kind).toBe('idle')
    })

    await it('startBrowsing → browsing; stopBrowsing → idle', async () => {
      const backend = new MockBackend()
      const service = new SessionService(() => makeEngineStub(), backend, 'peer-test')
      const states: string[] = []
      service.on('state-changed', (s) => states.push(s.kind))

      service.startBrowsing()
      expect(service.getState().kind).toBe('browsing')
      expect(backend.browsing).toBe(true)

      service.stopBrowsing()
      expect(service.getState().kind).toBe('idle')
      expect(backend.browsing).toBe(false)
      expect(states).toStrictEqual(['browsing', 'idle'])
    })

    await it('forwards LAN discovery events as service-discovered / service-gone', async () => {
      const backend = new MockBackend()
      const service = new SessionService(() => makeEngineStub(), backend, 'peer-test')

      const discovered: string[] = []
      const gone: string[] = []
      service.on('service-discovered', (s) => discovered.push(s.name))
      service.on('service-gone', (n) => gone.push(n))

      service.startBrowsing()
      backend.browseListener?.({
        kind: 'resolved',
        service: { name: "Bob's", host: 'bob.local', address: '10.0.0.1', port: 8089, txt: { room: 'abc' } },
      })
      backend.browseListener?.({ kind: 'gone', serviceName: "Bob's" })

      expect(discovered).toStrictEqual(["Bob's"])
      expect(gone).toStrictEqual(["Bob's"])
    })
  })

  await describe('SessionService — hosting', async () => {
    await it('startHosting publishes via the backend, transitions to hosting', async () => {
      const backend = new MockBackend()
      const service = new SessionService(() => makeEngineStub(), backend, 'peer-test')

      const roomId = await service.startHosting({
        sessionName: 'Test Session',
        projectName: 'Test Project',
        hostDisplayName: 'Pascal',
      })

      expect(typeof roomId).toBe('string')
      expect(roomId.length).toBe(8)
      const state = service.getState() as Extract<SessionState, { kind: 'hosting' }>
      expect(state.kind).toBe('hosting')
      expect(state.roomId).toBe(roomId)
      expect(state.port).toBe(backend.hostingPort)
      expect(backend.hostingArgs?.sessionName).toBe('Test Session')
    })

    await it('rejects starting a second hosting flow while one is active', async () => {
      const backend = new MockBackend()
      const service = new SessionService(() => makeEngineStub(), backend, 'peer-test')

      await service.startHosting({ sessionName: 'A', projectName: 'A', hostDisplayName: 'A' })
      let threw = false
      try {
        await service.startHosting({ sessionName: 'B', projectName: 'B', hostDisplayName: 'B' })
      } catch {
        threw = true
      }
      expect(threw).toBe(true)
    })

    await it('stopHosting tears down the publisher + WS server; returns to idle', async () => {
      const backend = new MockBackend()
      const service = new SessionService(() => makeEngineStub(), backend, 'peer-test')

      await service.startHosting({ sessionName: 'A', projectName: 'A', hostDisplayName: 'A' })
      await service.stopHosting()

      expect(service.getState().kind).toBe('idle')
      expect(backend.hostingArgs).toBeNull()
    })

    await it('stopHosting returns to browsing when browsing was on', async () => {
      const backend = new MockBackend()
      const service = new SessionService(() => makeEngineStub(), backend, 'peer-test')

      service.startBrowsing()
      await service.startHosting({ sessionName: 'A', projectName: 'A', hostDisplayName: 'A' })
      await service.stopHosting()
      expect(service.getState().kind).toBe('browsing')
    })
  })

  await describe('SessionService — joining (transport selection)', async () => {
    // joinLan / joinByRoomId eventually construct a CollabSession which
    // creates a real WebRTC peer connection. On Node the constructor
    // throws (no RTCPeerConnection); on GJS @gjsify/webrtc is wired
    // and the negotiation starts for real. We only verify the
    // backend transport-selection step here — the lower layers are
    // exercised by PeerSession's own spec.
    await it('joinLan calls backend.connectLan with the service address + port', async () => {
      const backend = new MockBackend()
      // Short snapshot timeout so the joiner flow rejects quickly
      // without blocking the test runner (the mock peer never
      // responds to the snapshot request).
      const service = new SessionService(() => makeEngineStub(), backend, 'peer-test', 50)

      service.on('error', () => {})
      try {
        await service.joinLan({
          name: "Bob's",
          host: 'bob.local',
          address: '10.0.0.1',
          port: 8089,
          txt: { room: 'r1' },
        })
      } catch {
        /* Node: throws on PeerSession constructor (no RTCPeerConnection).
         * GJS: throws on snapshot-request timeout. Either way the
         * backend assertion below still holds because connectLan
         * was called before the throw. */
      }

      expect(backend.lanConnectArgs?.host).toBe('10.0.0.1')
      expect(backend.lanConnectArgs?.port).toBe(8089)
    })

    await it('joinByRoomId calls backend.connectRelay with the room id', async () => {
      const backend = new MockBackend()
      // Short snapshot timeout — see joinLan test above for context.
      const service = new SessionService(() => makeEngineStub(), backend, 'peer-test', 50)

      service.on('error', () => {})
      try {
        await service.joinByRoomId('a3f2bb91')
      } catch {
        /* Same throw conditions as the LAN sibling above. */
      }

      expect(backend.relayConnectArgs?.roomId).toBe('a3f2bb91')
      expect(backend.relayConnectArgs?.role).toBe('joiner')
    })

    await it('joinByRoomId shortcuts through LAN when the room is discovered locally', async () => {
      // Regression for the hand-test bug user reported on 2026-05-30:
      // pasting `pixelrpg://join/<roomid>` for a same-LAN host hit
      // `Gio.ResolverError: signalling.pixelrpg.example` — the relay
      // URL is a placeholder. Same-LAN joins should never touch the
      // relay; they have a working LAN path right there.
      const backend = new MockBackend()
      const service = new SessionService(() => makeEngineStub(), backend, 'peer-test', 50)
      service.on('error', () => {})

      // Start browsing + deliver a fake LAN service that advertises
      // room id "abc". The service's connect target is irrelevant —
      // we just want SessionService to file it under the room id.
      service.startBrowsing()
      backend.browseListener?.({
        kind: 'resolved',
        service: {
          name: "Bob's",
          host: 'bob.local',
          address: '127.0.0.1',
          port: 9999,
          txt: { room: 'abc', project: 'Demo' },
        },
      })

      try {
        await service.joinByRoomId('abc')
      } catch {
        /* Snapshot times out after the 50ms ceiling; backend args
         * are recorded before the throw. */
      }

      // LAN path was taken — connectLan called with the discovered
      // service's address/port, connectRelay NOT called.
      expect(backend.lanConnectArgs?.host).toBe('127.0.0.1')
      expect(backend.lanConnectArgs?.port).toBe(9999)
      expect(backend.relayConnectArgs).toBeNull()
    })

    await it('joinByRoomId falls back to relay when the room is NOT in the LAN discovery cache', async () => {
      const backend = new MockBackend()
      const service = new SessionService(() => makeEngineStub(), backend, 'peer-test', 50)
      service.on('error', () => {})

      // Start browsing but DON'T deliver any service with the room
      // we're about to join.
      service.startBrowsing()
      backend.browseListener?.({
        kind: 'resolved',
        service: {
          name: "Bob's",
          host: 'bob.local',
          address: '127.0.0.1',
          port: 9999,
          txt: { room: 'OTHER_ROOM' },
        },
      })

      try {
        await service.joinByRoomId('abc')
      } catch {
        /* relay attempt fails synthetically via mock */
      }

      expect(backend.relayConnectArgs?.roomId).toBe('abc')
      expect(backend.lanConnectArgs).toBeNull()
    })

    await it('joinByRoomId falls back to relay when the LAN service has gone away', async () => {
      const backend = new MockBackend()
      const service = new SessionService(() => makeEngineStub(), backend, 'peer-test', 50)
      service.on('error', () => {})

      service.startBrowsing()
      backend.browseListener?.({
        kind: 'resolved',
        service: {
          name: "Bob's",
          host: 'bob.local',
          address: '127.0.0.1',
          port: 9999,
          txt: { room: 'abc' },
        },
      })
      // Bob's session withdraws — the LAN cache entry must clear so
      // the next join falls through to the relay path.
      backend.browseListener?.({ kind: 'gone', serviceName: "Bob's" })

      try {
        await service.joinByRoomId('abc')
      } catch {
        /* relay attempt fails synthetically via mock */
      }

      expect(backend.relayConnectArgs?.roomId).toBe('abc')
      expect(backend.lanConnectArgs).toBeNull()
    })
  })

  await describe('generatePeerId', async () => {
    await it('generates `peer-` prefixed ids of the documented length', async () => {
      const id = generatePeerId()
      expect(id).toMatch(/^peer-[a-z0-9]{12}$/)
    })

    await it('returns distinct ids on consecutive calls', async () => {
      const ids = new Set<string>()
      for (let i = 0; i < 20; i++) ids.add(generatePeerId())
      expect(ids.size).toBe(20)
    })
  })
}
