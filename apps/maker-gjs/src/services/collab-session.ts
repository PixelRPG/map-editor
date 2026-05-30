import type {
  AwarenessPeerInfo,
  Engine,
  ProjectSnapshot,
  SignallingTransport,
} from '@pixelrpg/engine'
import {
  AwarenessManager,
  captureProjectSnapshot,
  PeerSession,
  type PeerRole,
  RemoteCursorRenderer,
  SessionController,
  SnapshotExchange,
} from '@pixelrpg/engine'

export interface CollabSessionOptions {
  engine: Engine
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
 * Owns one `PeerSession` (raw WebRTC + signalling) plus the
 * `SessionController` that bridges it to the local `Engine`. The
 * caller supplies the `SignallingTransport` — `LanHostServer` /
 * `connectLanJoinerTransport` cover LAN today; the cross-internet
 * relay client (Phase 3e) plugs in here without touching the
 * collab class itself.
 *
 * Side-effect: the maker's entrypoint (`src/main.ts`) is responsible
 * for importing `@gjsify/webrtc/register` so `globalThis.RTCPeerConnection`
 * is wired before the first session opens. The register module is
 * GJS-only (imports `gi://Gst`, etc.) — keeping the import out of
 * this module keeps the Node test bundle building cleanly.
 */
export class CollabSession {
  public readonly peer: PeerSession
  public readonly controller: SessionController
  public readonly awareness: AwarenessManager
  public readonly cursorRenderer: RemoteCursorRenderer
  public readonly snapshotExchange: SnapshotExchange
  private closed = false
  private awarenessUnsubscribe: (() => void) | null = null
  private cursorUnsubscribe: (() => void) | null = null
  private readonly engine: Engine
  private readonly roomId: string

  constructor(opts: CollabSessionOptions) {
    this.engine = opts.engine
    this.roomId = opts.roomId ?? ''
    this.peer = new PeerSession({
      role: opts.role,
      signalling: opts.signalling,
    })
    this.controller = new SessionController({
      engine: opts.engine,
      session: this.peer,
      peerId: opts.peerId,
      onSessionProtocol: (op) => this.snapshotExchange.handle(op),
    })
    // Snapshot exchange — host responds to joiner requests by
    // capturing its current project state; joiner uses
    // `requestSnapshot()` to pull it. Constructed after the
    // controller so the `onSessionProtocol` hook above resolves
    // to a fully-initialised exchange by the time the first
    // protocol message arrives.
    this.snapshotExchange = new SnapshotExchange({
      controller: this.controller,
      // Returns null when the engine hasn't loaded a project yet
      // (host hasn't opened anything) — the requester sees a
      // timeout, which the UI surfaces as "host has no project to
      // share yet".
      captureSnapshot: () => captureProjectSnapshot(this.engine),
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
    // Inbound awareness frames arrive via the unreliable channel and
    // are dispatched through the typed peer-events bus.
    const dispose = this.peer.events.on('awareness-received', ({ data }) => {
      this.awareness.handleInbound(data)
    })
    this.awarenessUnsubscribe = () => dispose.close()
    // Render remote peers' cursors in-canvas via Excalibur actors.
    // Constructed up-front so a remote `peer-changed` arriving
    // before `start()` resolves still produces a dot.
    this.cursorRenderer = new RemoteCursorRenderer(opts.engine, this.awareness)
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
    await this.peer.connect()
    const announceOnConnect = this.peer.events.on('state-changed', ({ state }) => {
      if (state === 'connected') this.awareness.announce()
    })
    // If we already raced past `connecting`, fire once immediately so
    // late wires don't lose the first presence frame.
    if (this.peer.getState() === 'connected') this.awareness.announce()
    // The handle is dropped on close — wrap the existing tear-down so
    // we don't leak the listener if connect() resolved before any
    // state transition fired.
    const prevUnsub = this.awarenessUnsubscribe
    this.awarenessUnsubscribe = () => {
      announceOnConnect.close()
      prevUnsub?.()
    }
    // Bridge engine pointer → awareness cursor stream. The engine
    // hook fires on every Excalibur `pointermove`; the manager
    // throttles to ~33 Hz so the unreliable channel doesn't flood.
    this.cursorUnsubscribe = this.engine.onPointerMoved(({ sceneId, worldX, worldY }) => {
      this.awareness.sendCursor({ sceneId, x: worldX, y: worldY })
    })
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
   */
  requestSnapshot(timeoutMs?: number): Promise<ProjectSnapshot> {
    return this.snapshotExchange.request(this.roomId, timeoutMs)
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
    this.cursorUnsubscribe?.()
    this.cursorUnsubscribe = null
    this.awarenessUnsubscribe?.()
    this.awarenessUnsubscribe = null
    this.cursorRenderer.close()
    this.snapshotExchange.dispose()
    this.controller.close()
    this.peer.close(reason)
  }

  /** Whether the underlying peer connection is currently connected. */
  isConnected(): boolean {
    return this.peer.getState() === 'connected'
  }
}
