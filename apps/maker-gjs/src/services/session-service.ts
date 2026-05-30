import type { Engine, PeerRole, SignallingTransport } from '@pixelrpg/engine'

import { CollabSession } from './collab-session.ts'
import type { DiscoveredService, LanDiscoveryEvent } from './lan-discovery-parse.ts'
import { generateRoomId } from './relay-signalling.ts'
import { writeSnapshotToSandbox } from './sandbox-path.ts'

/**
 * Pluggable backend the {@link SessionService} drives.
 *
 * Production wires {@link LanPublisher} / {@link LanBrowser} /
 * `startLanHostServer` / `connectLanJoinerTransport` /
 * `connectRelaySignalling` from the sibling modules; tests pass
 * in-memory fakes so the orchestrator's state machine is exercised
 * without spinning up Avahi, WebSockets, or WebRTC.
 */
export interface SessionBackend {
  /** Begin browsing LAN sessions; deliver each event to `onEvent`. */
  startBrowsing(onEvent: (event: LanDiscoveryEvent) => void): void
  /** Stop browsing. */
  stopBrowsing(): void
  /** Publish a session via Avahi + bind the local LAN signalling server. */
  startHosting(opts: HostingOptions): Promise<HostingHandle>
  /** Connect to a peer over LAN. Returns the joiner-side transport. */
  connectLan(host: string, port: number): Promise<SignallingTransport>
  /** Connect to the cross-internet relay. */
  connectRelay(roomId: string, role: PeerRole): Promise<SignallingTransport>
}

export interface HostingOptions {
  roomId: string
  sessionName: string
  projectName: string
  hostDisplayName: string
}

export interface HostingHandle {
  /** Port bound by the LAN signalling server. */
  port: number
  /** Fires once when the joiner connects; the resulting transport is wired into PeerSession. */
  onPeerConnected: (cb: (transport: SignallingTransport) => void) => void
  close(): Promise<void>
}

export type SessionState =
  | { kind: 'idle' }
  | { kind: 'browsing' }
  | { kind: 'hosting'; roomId: string; port: number }
  | { kind: 'connecting' }
  /**
   * Joiner-only: the peer connection is up, the snapshot has been
   * pulled + written to `sandboxProjectPath`, but the engine is
   * not yet attached. The caller (ApplicationWindow) is expected
   * to load the project at `sandboxProjectPath` and then call
   * `attachEngineToCurrentSession(engine)` — at which point the
   * state transitions to `connected`.
   */
  | {
      kind: 'awaiting-engine'
      role: PeerRole
      roomId: string
      collab: CollabSession
      sandboxProjectPath: string
    }
  | { kind: 'connected'; role: PeerRole; roomId: string; collab: CollabSession }

export interface SessionEvents {
  'state-changed': SessionState
  'service-discovered': DiscoveredService
  'service-gone': string
  /**
   * Joiner-only: the sandbox project has been written to disk +
   * is ready to load. Listener is expected to open the project
   * at `sandboxProjectPath` via the existing project-loader and
   * then call `sessionService.attachEngineToCurrentSession(engine)`.
   *
   * Payload includes `collab` so the caller can attach the engine
   * directly without round-tripping through SessionService if
   * preferred.
   */
  'sandbox-project-ready': {
    roomId: string
    sandboxProjectPath: string
    collab: CollabSession
  }
  error: Error
}

type Listener<T> = (payload: T) => void

/**
 * Discovered LAN services keyed by their `txt.room` field — the
 * room id the host advertises. Lets `joinByRoomId` shortcut to
 * the LAN path when the same room is reachable on this network,
 * skipping the relay (which currently points at a placeholder
 * `signalling.pixelrpg.example` and would fail with
 * `Gio.ResolverError`).
 */
type DiscoveredByRoom = Map<string, DiscoveredService>

/**
 * Orchestrates the Pair-Editing lifecycle on top of the platform-
 * specific pieces (LAN discovery, LAN signalling, relay signalling)
 * + the engine-side {@link CollabSession}.
 *
 * Single state machine (one session at a time per maker) covering
 * three flows:
 *
 *  - **Browse** — show "Sessions on this network" in the Welcome
 *    view. The service listens to {@link LanDiscoveryEvent}s and
 *    re-emits them as typed `service-discovered` / `service-gone`.
 *
 *  - **Host** — generate a room id, publish via Avahi, bind the
 *    local LAN signalling server. On joiner-connect, build a
 *    CollabSession as `host`. The room id is also the share-token
 *    for cross-internet joiners over the relay.
 *
 *  - **Join** — either a discovered LAN service (direct WS to the
 *    advertised port) or a `pixelrpg://join/<roomid>` URL (relay
 *    transport). Build a CollabSession as `joiner`.
 *
 * Concurrency: starting any flow while one is active first stops
 * the current one. Closing a CollabSession resets the state to
 * `browsing` (if the service was browsing before) or `idle`.
 */
export class SessionService {
  private readonly listeners = new Map<keyof SessionEvents, Set<Listener<unknown>>>()
  private state: SessionState = { kind: 'idle' }
  private hostingHandle: HostingHandle | null = null
  private wasBrowsing = false
  /** Updated as `service-discovered` / `service-gone` events flow. */
  private readonly discoveredByRoom: DiscoveredByRoom = new Map()

  /**
   * @param engineProvider Lazy resolver returning the active engine,
   *   or `null` when no project is loaded yet. The HOST flow requires
   *   it (you can't share something you don't have); the JOINER flow
   *   no longer requires it — joiners pull the host's snapshot into a
   *   sandbox directory first, the ApplicationWindow loads the
   *   sandbox project, and then attaches the engine via
   *   `attachEngineToCurrentSession`.
   */
  constructor(
    private readonly engineProvider: () => Engine | null,
    private readonly backend: SessionBackend,
    /** Stable id for this peer — stamped onto every emitted Operation. */
    private readonly peerId: string,
    /**
     * Override the joiner-side snapshot timeout. Production
     * default is 10 s (CollabSession's own default). Tests pass
     * a small value to avoid blocking the test runner when the
     * mock peer never responds.
     */
    private readonly snapshotTimeoutMs?: number,
  ) {}

  // ────────────────────────────────────────────────────────────
  // Discovery
  // ────────────────────────────────────────────────────────────

  startBrowsing(): void {
    if (this.state.kind !== 'idle' && this.state.kind !== 'browsing') return
    if (this.state.kind === 'browsing') return
    this.backend.startBrowsing((event) => {
      if (event.kind === 'resolved') {
        // Index by room id so a paste-link join can short-circuit
        // through LAN when the room is actually reachable here.
        const room = event.service.txt.room
        if (room) this.discoveredByRoom.set(room, event.service)
        this.emit('service-discovered', event.service)
      } else {
        // service-gone carries a service NAME, not a room id; walk
        // the room map to evict any entries whose service-name
        // matches.
        for (const [room, service] of this.discoveredByRoom) {
          if (service.name === event.serviceName) this.discoveredByRoom.delete(room)
        }
        this.emit('service-gone', event.serviceName)
      }
    })
    this.wasBrowsing = true
    this.setState({ kind: 'browsing' })
  }

  stopBrowsing(): void {
    this.backend.stopBrowsing()
    this.wasBrowsing = false
    if (this.state.kind === 'browsing') this.setState({ kind: 'idle' })
  }

  // ────────────────────────────────────────────────────────────
  // Host
  // ────────────────────────────────────────────────────────────

  /**
   * Generate a fresh room id, publish via Avahi, start the LAN
   * signalling server. Resolves once the server is bound; the joiner
   * may arrive at any later point — handled by the
   * `onPeerConnected` callback.
   *
   * `projectName` + `sessionName` populate the mDNS TXT records the
   * joiner-side Welcome view filters on.
   */
  async startHosting(opts: { sessionName: string; projectName: string; hostDisplayName: string }): Promise<string> {
    if (this.state.kind === 'connected' || this.state.kind === 'connecting' || this.state.kind === 'hosting') {
      throw new Error(`SessionService: cannot start hosting from state "${this.state.kind}"`)
    }
    const roomId = generateRoomId()
    const handle = await this.backend.startHosting({
      roomId,
      sessionName: opts.sessionName,
      projectName: opts.projectName,
      hostDisplayName: opts.hostDisplayName,
    })
    this.hostingHandle = handle
    handle.onPeerConnected((transport) => {
      void this.openSession('host', roomId, transport)
    })
    this.setState({ kind: 'hosting', roomId, port: handle.port })
    return roomId
  }

  async stopHosting(): Promise<void> {
    if (this.hostingHandle) {
      await this.hostingHandle.close().catch(() => {})
      this.hostingHandle = null
    }
    if (this.state.kind === 'hosting') {
      this.setState(this.wasBrowsing ? { kind: 'browsing' } : { kind: 'idle' })
    }
  }

  // ────────────────────────────────────────────────────────────
  // Join
  // ────────────────────────────────────────────────────────────

  async joinLan(service: DiscoveredService): Promise<void> {
    this.requireIdleForJoin()
    this.setState({ kind: 'connecting' })
    try {
      const transport = await this.backend.connectLan(service.address, service.port)
      const roomId = service.txt.room ?? service.name
      await this.openSession('joiner', roomId, transport)
    } catch (err) {
      this.handleError(err)
      this.setState(this.wasBrowsing ? { kind: 'browsing' } : { kind: 'idle' })
      throw err
    }
  }

  async joinByRoomId(roomId: string): Promise<void> {
    this.requireIdleForJoin()
    // Prefer the LAN path when the room is reachable on this
    // network — the relay default URL is a placeholder today
    // (`signalling.pixelrpg.example`) and fails with
    // `Gio.ResolverError` for users who haven't deployed their
    // own. Same-machine + same-LAN pair-editing therefore goes
    // through Avahi → direct WebSocket without ever touching
    // the relay.
    const lanMatch = this.discoveredByRoom.get(roomId)
    if (lanMatch) {
      await this.joinLan(lanMatch)
      return
    }
    this.setState({ kind: 'connecting' })
    try {
      const transport = await this.backend.connectRelay(roomId, 'joiner')
      await this.openSession('joiner', roomId, transport)
    } catch (err) {
      this.handleError(err)
      this.setState(this.wasBrowsing ? { kind: 'browsing' } : { kind: 'idle' })
      throw err
    }
  }

  /**
   * Joiner-side: complete the session by attaching the freshly-
   * loaded engine to the existing CollabSession. Call this from
   * the `sandbox-project-ready` event handler once the
   * ApplicationWindow has the engine + the sandbox project
   * loaded.
   *
   * Throws when called outside the `awaiting-engine` state — the
   * caller is expected to listen to `state-changed` to know when
   * this is valid.
   */
  attachEngineToCurrentSession(engine: Engine): void {
    if (this.state.kind !== 'awaiting-engine') {
      throw new Error(
        `SessionService: attachEngineToCurrentSession called in state "${this.state.kind}" — expected "awaiting-engine"`,
      )
    }
    const { role, roomId, collab } = this.state
    collab.attachEngine(engine)
    this.setState({ kind: 'connected', role, roomId, collab })
  }

  private requireIdleForJoin(): void {
    const blocking: SessionState['kind'][] = ['connecting', 'awaiting-engine', 'connected']
    if (blocking.includes(this.state.kind)) {
      throw new Error(`SessionService: cannot join from state "${this.state.kind}"`)
    }
  }

  // ────────────────────────────────────────────────────────────
  // Leave
  // ────────────────────────────────────────────────────────────

  async leaveSession(reason = 'user-left'): Promise<void> {
    if (this.state.kind === 'connected' || this.state.kind === 'awaiting-engine') {
      this.state.collab.close(reason)
    }
    if (this.state.kind === 'connected' || this.state.kind === 'awaiting-engine' || this.state.kind === 'hosting') {
      await this.stopHosting()
      this.setState(this.wasBrowsing ? { kind: 'browsing' } : { kind: 'idle' })
    }
  }

  // ────────────────────────────────────────────────────────────
  // Events
  // ────────────────────────────────────────────────────────────

  on<K extends keyof SessionEvents>(event: K, listener: Listener<SessionEvents[K]>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener as Listener<unknown>)
    return () => set?.delete(listener as Listener<unknown>)
  }

  getState(): SessionState {
    return this.state
  }

  // ────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────

  private async openSession(role: PeerRole, roomId: string, transport: SignallingTransport): Promise<void> {
    if (role === 'host') {
      const engine = this.engineProvider()
      if (!engine) {
        try {
          transport.close()
        } catch {
          /* best-effort */
        }
        throw new Error('SessionService: no engine available — load a project before hosting')
      }
      const collab = new CollabSession({
        engine,
        role,
        signalling: transport,
        peerId: this.peerId,
        roomId,
      })
      await collab.start()
      this.wireCollabClose(collab)
      this.setState({ kind: 'connected', role, roomId, collab })
      return
    }

    // role === 'joiner': sandbox flow. Construct the CollabSession
    // WITHOUT an engine, request the host's project state, write it
    // to a per-room sandbox directory, then surface a
    // `sandbox-project-ready` event for the UI layer to open the
    // sandbox project + attach the engine.
    const collab = new CollabSession({
      role,
      signalling: transport,
      peerId: this.peerId,
      roomId,
      // engine deliberately omitted — attached after sandbox load.
    })
    try {
      await collab.start()
      const snapshot = await collab.requestSnapshot(this.snapshotTimeoutMs)
      const sandboxProjectPath = await writeSnapshotToSandbox(snapshot, roomId)
      this.wireCollabClose(collab)
      this.setState({ kind: 'awaiting-engine', role, roomId, collab, sandboxProjectPath })
      this.emit('sandbox-project-ready', { roomId, sandboxProjectPath, collab })
    } catch (err) {
      try {
        collab.close('join-failed')
      } catch {
        /* best-effort */
      }
      throw err
    }
  }

  /**
   * Subscribe to the peer's `closed` event so a remote disconnect
   * automatically transitions the session back to its pre-join
   * state (idle / browsing). Shared between host + joiner paths.
   */
  private wireCollabClose(collab: CollabSession): void {
    collab.peer.events.on('closed', () => {
      if (
        (this.state.kind === 'connected' || this.state.kind === 'awaiting-engine') &&
        this.state.collab === collab
      ) {
        void this.stopHosting()
        this.setState(this.wasBrowsing ? { kind: 'browsing' } : { kind: 'idle' })
      }
    })
  }

  private setState(state: SessionState): void {
    this.state = state
    this.emit('state-changed', state)
  }

  private emit<K extends keyof SessionEvents>(event: K, payload: SessionEvents[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const listener of set) (listener as Listener<SessionEvents[K]>)(payload)
  }

  private handleError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err))
    this.emit('error', error)
  }
}

/**
 * Generate a stable per-user peer id. Used by the SessionService at
 * construction; the maker may eventually persist it via GSettings
 * for "this user's id stays the same across launches" UX.
 */
export function generatePeerId(): string {
  // Browser-style randomness with a `peer-` prefix to make logs
  // self-documenting. Length matches the relay's roomId budget so
  // both fit comfortably in log lines.
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = 'peer-'
  for (let i = 0; i < 12; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)]
  return id
}
