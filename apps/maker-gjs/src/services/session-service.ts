import type { Engine, PeerRole, SignallingTransport } from '@pixelrpg/engine'

import { CollabSession } from './collab-session.ts'
import { generateRoomId } from './relay-signalling.ts'
import type { DiscoveredService, LanDiscoveryEvent } from './lan-discovery-parse.ts'

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
  | { kind: 'connected'; role: PeerRole; roomId: string; collab: CollabSession }

export interface SessionEvents {
  'state-changed': SessionState
  'service-discovered': DiscoveredService
  'service-gone': string
  error: Error
}

type Listener<T> = (payload: T) => void

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

  constructor(
    private readonly engine: Engine,
    private readonly backend: SessionBackend,
    /** Stable id for this peer — stamped onto every emitted Operation. */
    private readonly peerId: string,
  ) {}

  // ────────────────────────────────────────────────────────────
  // Discovery
  // ────────────────────────────────────────────────────────────

  startBrowsing(): void {
    if (this.state.kind !== 'idle' && this.state.kind !== 'browsing') return
    if (this.state.kind === 'browsing') return
    this.backend.startBrowsing((event) => {
      if (event.kind === 'resolved') this.emit('service-discovered', event.service)
      else this.emit('service-gone', event.serviceName)
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
    if (this.state.kind === 'connecting' || this.state.kind === 'connected') {
      throw new Error(`SessionService: cannot join from state "${this.state.kind}"`)
    }
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
    if (this.state.kind === 'connecting' || this.state.kind === 'connected') {
      throw new Error(`SessionService: cannot join from state "${this.state.kind}"`)
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

  // ────────────────────────────────────────────────────────────
  // Leave
  // ────────────────────────────────────────────────────────────

  async leaveSession(reason = 'user-left'): Promise<void> {
    if (this.state.kind !== 'connected') return
    this.state.collab.close(reason)
    await this.stopHosting()
    this.setState(this.wasBrowsing ? { kind: 'browsing' } : { kind: 'idle' })
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
    const collab = new CollabSession({
      engine: this.engine,
      role,
      signalling: transport,
      peerId: this.peerId,
    })
    await collab.start()
    collab.peer.events.on('closed', () => {
      if (this.state.kind === 'connected' && this.state.collab === collab) {
        void this.stopHosting()
        this.setState(this.wasBrowsing ? { kind: 'browsing' } : { kind: 'idle' })
      }
    })
    this.setState({ kind: 'connected', role, roomId, collab })
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
