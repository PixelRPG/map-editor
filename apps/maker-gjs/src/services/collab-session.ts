import type { AwarenessPeerInfo, Engine, SignallingTransport } from '@pixelrpg/engine'
import { AwarenessManager, PeerSession, type PeerRole, SessionController } from '@pixelrpg/engine'

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
  private closed = false
  private awarenessUnsubscribe: (() => void) | null = null
  private cursorUnsubscribe: (() => void) | null = null
  private readonly engine: Engine

  constructor(opts: CollabSessionOptions) {
    this.engine = opts.engine
    this.peer = new PeerSession({
      role: opts.role,
      signalling: opts.signalling,
    })
    this.controller = new SessionController({
      engine: opts.engine,
      session: this.peer,
      peerId: opts.peerId,
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
    this.controller.close()
    this.peer.close(reason)
  }

  /** Whether the underlying peer connection is currently connected. */
  isConnected(): boolean {
    return this.peer.getState() === 'connected'
  }
}
