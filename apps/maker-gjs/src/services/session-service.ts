import type { Engine, PeerRole, SignallingTransport } from '@pixelrpg/engine'

import { scopedLogger } from './collab-log.ts'
import { CollabSession } from './collab-session.ts'
import type { DiscoveredService, LanDiscoveryEvent } from './lan-discovery-parse.ts'
import { generateRoomId } from './relay-signalling.ts'
import { applyDiscoveryEvent, type DiscoveredByRoom } from './session-discovery-index.ts'
import { pullSnapshotToSandbox, requireHostEngine, startOrTearDown } from './session-open-flow.ts'
import { blocksHosting, blocksJoin, hasLiveCollab, preSessionState, type SessionState } from './session-state.ts'
import { TypedEmitter } from './typed-emitter.ts'

const log = scopedLogger('session-service')

export type { SessionState } from './session-state.ts'

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
  private readonly events = new TypedEmitter<SessionEvents>()
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
    /**
     * Override the WebRTC negotiation deadline that gates
     * {@link CollabSession.start}. Production default is 15 s
     * (CollabSession's `PEER_CONNECT_TIMEOUT_MS`). Tests pass a
     * small value so a `MockTransport` that never carries SDP
     * fails fast rather than blocking the test runner. Forwarded
     * verbatim to every CollabSession this service constructs.
     */
    private readonly peerConnectTimeoutMs?: number,
    /**
     * Inject the RTCPeerConnection factory used by every
     * CollabSession this service constructs — forwarded as-is to
     * {@link CollabSession}. Production omits this so the shared
     * `globalThis.RTCPeerConnection` (wired by `main.ts`'s
     * `@gjsify/webrtc/register` import) is used. Tests pass a
     * paired `rtcFactoryFor(new FakeRTCPeerConnection())` so the
     * full join flow can be exercised without GStreamer.
     */
    private readonly rtcFactory?: ConstructorParameters<typeof CollabSession>[0]['rtcFactory'],
  ) {}

  // ────────────────────────────────────────────────────────────
  // Discovery
  // ────────────────────────────────────────────────────────────

  startBrowsing(): void {
    if (this.state.kind !== 'idle' && this.state.kind !== 'browsing') return
    if (this.state.kind === 'browsing') return
    try {
      this.backend.startBrowsing((event) => {
        const outcome = applyDiscoveryEvent(this.discoveredByRoom, event)
        if (outcome.kind === 'discovered') this.emit('service-discovered', outcome.service)
        else this.emit('service-gone', outcome.serviceName)
      })
    } catch (err) {
      // Discovery needs `avahi-browse` on PATH; plenty of systems (a
      // stock postmarketOS phone image, a minimal container) do not ship
      // it. Browsing is an optional convenience — the Welcome view shows
      // an empty "Sessions on this network" pane and hosting / joining by
      // room id still work — so a missing daemon must not reach the GJS
      // toplevel as an unhandled exception, which is what it did before.
      // State stays `idle`, so a later retry is not blocked by a
      // `browsing` state that nothing is backing.
      log.warn('LAN discovery unavailable — continuing without it', err)
      return
    }
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
    if (blocksHosting(this.state.kind)) {
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
      // Wrap openSession's rejection in an explicit `.catch` so
      // hand-test users get a typed error instead of GJS's
      // generic "Unhandled promise rejection" stack-only warning.
      // {@link handleError} both logs (via the centralised collab
      // logger) AND emits the typed `'error'` event — the welcome-
      // view toast handler subscribes to that event, so the user
      // sees the actual failure reason instead of a stack trace
      // they can't act on.
      this.openHostSession(roomId, transport).catch((err) => {
        log.warn('host-side openSession failed', err)
        this.handleError(err)
        // Host-path failures leave the session in `hosting` state
        // (the server is still bound; a new joiner could try again).
        // Don't reset state here — only the user pressing "Stop
        // sharing" should do that.
      })
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
      this.resetToPreSession()
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
      await this.openJoinerSession(roomId, transport)
    } catch (err) {
      this.handleError(err)
      this.resetToPreSession()
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
      await this.openJoinerSession(roomId, transport)
    } catch (err) {
      this.handleError(err)
      this.resetToPreSession()
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
    if (blocksJoin(this.state.kind)) {
      throw new Error(`SessionService: cannot join from state "${this.state.kind}"`)
    }
  }

  // ────────────────────────────────────────────────────────────
  // Leave
  // ────────────────────────────────────────────────────────────

  async leaveSession(reason = 'user-left'): Promise<void> {
    // `collab.close` fires the peer's `closed` event synchronously,
    // which runs `wireCollabClose` and can already have reset the
    // state — so the second guard re-reads `this.state` rather than
    // reusing a captured copy.
    if (hasLiveCollab(this.state)) this.state.collab.close(reason)
    if (hasLiveCollab(this.state) || this.state.kind === 'hosting') {
      await this.stopHosting()
      this.resetToPreSession()
    }
  }

  // ────────────────────────────────────────────────────────────
  // Events
  // ────────────────────────────────────────────────────────────

  on<K extends keyof SessionEvents>(event: K, listener: (payload: SessionEvents[K]) => void): () => void {
    return this.events.on(event, listener)
  }

  getState(): SessionState {
    return this.state
  }

  // ────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────

  private async openHostSession(roomId: string, transport: SignallingTransport): Promise<void> {
    const engine = requireHostEngine(this.engineProvider(), transport)
    const collab = this.createCollab({ engine, role: 'host', roomId, transport })
    await startOrTearDown(collab, 'host-start-failed')
    this.wireCollabClose(collab)
    this.setState({ kind: 'connected', role: 'host', roomId, collab })
  }

  /**
   * Joiner sandbox flow. Construct the CollabSession WITHOUT an engine,
   * request the host's project state, write it to a per-room sandbox
   * directory, then surface a `sandbox-project-ready` event for the UI
   * layer to open the sandbox project + attach the engine.
   */
  private async openJoinerSession(roomId: string, transport: SignallingTransport): Promise<void> {
    const collab = this.createCollab({ role: 'joiner', roomId, transport })
    try {
      const sandboxProjectPath = await pullSnapshotToSandbox(collab, roomId, {
        log,
        snapshotTimeoutMs: this.snapshotTimeoutMs,
      })
      this.wireCollabClose(collab)
      this.setState({ kind: 'awaiting-engine', role: 'joiner', roomId, collab, sandboxProjectPath })
      this.emit('sandbox-project-ready', { roomId, sandboxProjectPath, collab })
    } catch (err) {
      // Critical: the ONLY place `bye: join-failed` is sent is the
      // collab.close('join-failed') line below. If you see that bye
      // on the host side without a typed error logged here, this
      // catch was hit but the error swallowed — never happen. The
      // log + handleError emit BOTH so the operator sees it in the
      // terminal AND the UI gets a toast.
      log.warn('joiner: openSession failed (sending bye: join-failed)', err)
      this.handleError(err)
      try {
        collab.close('join-failed')
      } catch {
        /* best-effort */
      }
      throw err
    }
  }

  private createCollab(opts: {
    engine?: Engine
    role: PeerRole
    roomId: string
    transport: SignallingTransport
  }): CollabSession {
    return new CollabSession({
      engine: opts.engine,
      role: opts.role,
      signalling: opts.transport,
      peerId: this.peerId,
      roomId: opts.roomId,
      peerConnectTimeoutMs: this.peerConnectTimeoutMs,
      rtcFactory: this.rtcFactory,
    })
  }

  /**
   * Subscribe to the peer's `closed` event so a remote disconnect
   * automatically transitions the session back to its pre-join
   * state (idle / browsing). Shared between host + joiner paths.
   */
  private wireCollabClose(collab: CollabSession): void {
    collab.peer.events.on('closed', () => {
      if (hasLiveCollab(this.state) && this.state.collab === collab) {
        void this.stopHosting()
        this.resetToPreSession()
      }
    })
  }

  /**
   * Reset to the pre-session state after a session ends or fails: back to
   * `browsing` if the welcome view was browsing when we started, else
   * `idle`. Recurs across every host/join teardown + error path.
   */
  private resetToPreSession(): void {
    this.setState(preSessionState(this.wasBrowsing))
  }

  private setState(state: SessionState): void {
    this.state = state
    this.emit('state-changed', state)
  }

  private emit<K extends keyof SessionEvents>(event: K, payload: SessionEvents[K]): void {
    this.events.emit(event, payload)
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
