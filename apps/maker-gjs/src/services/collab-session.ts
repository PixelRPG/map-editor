import type {
  AwarenessPeerInfo,
  Engine,
  ProjectSnapshot,
  SignallingTransport,
} from '@pixelrpg/engine'
import {
  AwarenessManager,
  captureProjectSnapshot,
  isSessionProtocolOp,
  PeerSession,
  type PeerRole,
  RemoteCursorRenderer,
  SessionController,
  SnapshotExchange,
} from '@pixelrpg/engine'

export interface CollabSessionOptions {
  /**
   * Optional — when omitted the session starts in an "engine-
   * less" state: handshake + awareness work, snapshot requests
   * work, but op-sync + cursor render don't until
   * {@link CollabSession.attachEngine} is called. The sandbox
   * joiner flow uses this: connect first, pull the host's
   * snapshot, write it to a sandbox directory, load the engine,
   * THEN attach.
   *
   * Host paths always pass it up-front; joiner paths attach
   * after the sandbox project loads.
   */
  engine?: Engine
  role: PeerRole
  signalling: SignallingTransport
  /** Stable id for this peer — stamped onto every emitted Operation. */
  peerId: string
  /**
   * Display info broadcast on session start so the peer's UI can
   * render our cursor + name. Default colours are picked from the
   * Adwaita accent palette so peers without explicit config still
   * land on a recognisable hue.
   */
  localInfo?: AwarenessPeerInfo
  /**
   * Stable id for the session — used as the `roomId` tag on
   * snapshot requests. Defaults to `''` when omitted (single
   * pair session per process; tagging is diagnostic).
   */
  roomId?: string
}

/**
 * Top-level glue holding the active Pair-Editing session together.
 *
 * Owns one `PeerSession` (raw WebRTC + signalling) and lazily
 * builds the engine-dependent pieces (`SessionController`,
 * `RemoteCursorRenderer`, engine pointer-source) when an `Engine`
 * is provided — either via the constructor option or via
 * {@link attachEngine} after construction.
 *
 * Three lifetimes coexist:
 *
 *   - **Always**: `PeerSession`, `AwarenessManager`,
 *     `SnapshotExchange`. These work without an engine.
 *   - **Once engine attached**: `SessionController` (commands
 *     in/out), `RemoteCursorRenderer` (paints peers' cursors in
 *     the canvas), local pointer-source (broadcasts our cursor).
 *
 * Side-effect: the maker's entrypoint (`src/main.ts`) is responsible
 * for importing `@gjsify/webrtc/register` so `globalThis.RTCPeerConnection`
 * is wired before the first session opens. The register module is
 * GJS-only (imports `gi://Gst`, etc.) — keeping the import out of
 * this module keeps the Node test bundle building cleanly.
 */
export class CollabSession {
  public readonly peer: PeerSession
  public readonly awareness: AwarenessManager
  public readonly snapshotExchange: SnapshotExchange
  /** Set once {@link attachEngine} runs. `null` in the joiner-pre-snapshot phase. */
  public controller: SessionController | null = null
  public cursorRenderer: RemoteCursorRenderer | null = null
  private closed = false
  private engine: Engine | null = null
  private readonly peerId: string
  private readonly roomId: string
  private readonly subscriptions: Array<() => void> = []
  private startedAt: number | null = null

  constructor(opts: CollabSessionOptions) {
    this.peerId = opts.peerId
    this.roomId = opts.roomId ?? ''
    this.peer = new PeerSession({
      role: opts.role,
      signalling: opts.signalling,
    })

    // Default display info — caller can override via `localInfo`.
    // The placeholder colour matches the Adwaita "blue-3" accent so
    // a default-styled peer still sits cleanly on either the light
    // or dark scratchpad backdrop.
    const localInfo: AwarenessPeerInfo = opts.localInfo ?? {
      displayName: opts.peerId,
      color: '#1c71d8',
    }
    this.awareness = new AwarenessManager({
      localPeerId: opts.peerId,
      localInfo,
      send: (message) => this.peer.sendAwareness(message),
    })
    // Inbound awareness frames arrive via the unreliable channel.
    const awarenessSub = this.peer.events.on('awareness-received', ({ data }) => {
      this.awareness.handleInbound(data)
    })
    this.subscriptions.push(() => awarenessSub.close())

    // Snapshot exchange is engine-independent — uses raw `sendOp`
    // for the protocol frames + a captureSnapshot closure that
    // returns null when no engine is attached. CollabSession
    // routes inbound session-protocol ops here directly (the
    // command-path filter in SessionController also skips them,
    // but works even when the controller hasn't been built yet).
    this.snapshotExchange = new SnapshotExchange({
      peerId: opts.peerId,
      send: (op) => this.peer.sendOp(op),
      captureSnapshot: () => (this.engine ? captureProjectSnapshot(this.engine) : null),
    })
    const opSub = this.peer.events.on('op-received', ({ op }) => {
      if (isSessionProtocolOp(op)) this.snapshotExchange.handle(op)
    })
    this.subscriptions.push(() => opSub.close())

    if (opts.engine) this.attachEngine(opts.engine)
  }

  /**
   * Wire the engine-dependent layers — command sync via
   * SessionController, remote-cursor rendering, local cursor
   * pointer-source. Call EXACTLY once; throws on second attach.
   *
   * Typical sandbox-joiner flow:
   *
   *   1. `new CollabSession({ engine: undefined, ... })`
   *   2. `await session.start()`            ← handshake + presence
   *   3. `await session.requestSnapshot()`  ← pull host's state
   *   4. write snapshot to sandbox dir; load engine from there
   *   5. `session.attachEngine(engine)`     ← commands + cursors start flowing
   *
   * Host flow remains unchanged: pass `engine` in the constructor;
   * attach happens implicitly.
   *
   * NOTE: ops received between `start()` and `attachEngine()` are
   * dropped (no command target). For the sandbox window this is
   * acceptable — the host typically isn't editing while it
   * services a snapshot request — but a future PR could add a
   * pre-attach buffer for stricter consistency.
   */
  attachEngine(engine: Engine): void {
    if (this.closed) throw new Error('CollabSession: attachEngine called after close()')
    if (this.engine) throw new Error('CollabSession: engine already attached')
    this.engine = engine
    this.controller = new SessionController({
      engine,
      session: this.peer,
      peerId: this.peerId,
      // CollabSession already routes session-protocol ops to the
      // exchange (see `op-received` subscription in the constructor).
      // SessionController's own filter drops them via the no-hook
      // path; we deliberately don't double-route through here.
    })
    this.cursorRenderer = new RemoteCursorRenderer(engine, this.awareness)
    // Bridge engine pointer → awareness cursor stream. The engine
    // hook fires on every Excalibur `pointermove`; the manager
    // throttles to ~33 Hz so the unreliable channel doesn't flood.
    const cursorDispose = engine.onPointerMoved(({ sceneId, worldX, worldY }) => {
      this.awareness.sendCursor({ sceneId, x: worldX, y: worldY })
    })
    this.subscriptions.push(() => cursorDispose())
  }

  /**
   * Drive the WebRTC handshake. Resolves once ICE gathering kicks
   * off; full "connected" status lands on `peer.events('state-
   * changed')`.
   *
   * Once `connected`, an initial `presence` frame goes out so the
   * remote peer's roster + cursor UI populate immediately. Repeat
   * announces are cheap — the receiver dedupes by comparing against
   * its tracked state.
   */
  async start(): Promise<void> {
    this.startedAt = Date.now()
    try {
      await this.peer.connect()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[collab-session] peer.connect() failed: ${message}`)
      if (err instanceof Error && err.stack) console.warn(err.stack)
      throw err
    }
    const announceOnConnect = this.peer.events.on('state-changed', ({ state }) => {
      if (state === 'connected') this.awareness.announce()
    })
    // If we already raced past `connecting`, fire once immediately so
    // late wires don't lose the first presence frame.
    if (this.peer.getState() === 'connected') this.awareness.announce()
    this.subscriptions.push(() => announceOnConnect.close())
  }

  /**
   * Joiner-side convenience: pull the host's current project state.
   * Resolves with the parsed {@link ProjectSnapshot}; the caller
   * (typically the maker's sandbox-write step) is responsible for
   * landing it on disk + opening it as the active project.
   *
   * Times out after `timeoutMs` (default 10 s) — long enough for
   * a fat snapshot over a slow LAN, short enough to surface a
   * stalled host before the user gives up.
   *
   * Engine-independent: works in the pre-attach phase. The host
   * peer responds from its own captureProjectSnapshot regardless
   * of whether the joiner has an engine yet.
   */
  requestSnapshot(timeoutMs?: number): Promise<ProjectSnapshot> {
    return this.snapshotExchange.request(this.roomId, timeoutMs)
  }

  /** Whether `attachEngine` has been called yet. */
  hasEngine(): boolean {
    return this.engine !== null
  }

  /** Whether the underlying peer connection is currently connected. */
  isConnected(): boolean {
    return this.peer.getState() === 'connected'
  }

  /** Tear down. Idempotent. */
  close(reason = 'closed'): void {
    if (this.closed) return
    this.closed = true
    // Best-effort leave — if the channel is still open the peer
    // drops our cursor immediately; otherwise PeerSession's 'closed'
    // event is the fallback.
    try {
      this.awareness.leave()
    } catch {
      /* channel may already be torn down */
    }
    for (const dispose of this.subscriptions) {
      try {
        dispose()
      } catch {
        /* best-effort */
      }
    }
    this.subscriptions.length = 0
    this.cursorRenderer?.close()
    this.cursorRenderer = null
    this.snapshotExchange.dispose()
    this.controller?.close()
    this.controller = null
    this.peer.close(reason)
    void this.startedAt
  }
}
