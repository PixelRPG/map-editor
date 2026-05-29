import '@gjsify/webrtc/register'

import type { Engine, SignallingTransport } from '@pixelrpg/engine'
import { PeerSession, type PeerRole, SessionController } from '@pixelrpg/engine'

export interface CollabSessionOptions {
  engine: Engine
  role: PeerRole
  signalling: SignallingTransport
  /** Stable id for this peer — stamped onto every emitted Operation. */
  peerId: string
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
 * Side-effect: imports `@gjsify/webrtc/register` so `globalThis
 * .RTCPeerConnection` is wired before the underlying `PeerSession`
 * tries to construct one. Top-level import keeps the side effect
 * out of the constructor (the register module is idempotent).
 */
export class CollabSession {
  public readonly peer: PeerSession
  public readonly controller: SessionController
  private closed = false

  constructor(opts: CollabSessionOptions) {
    this.peer = new PeerSession({
      role: opts.role,
      signalling: opts.signalling,
    })
    this.controller = new SessionController({
      engine: opts.engine,
      session: this.peer,
      peerId: opts.peerId,
    })
  }

  /**
   * Drive the WebRTC handshake. Resolves once ICE gathering kicks
   * off; full "connected" status lands on `peer.events('state-
   * changed')`.
   */
  async start(): Promise<void> {
    await this.peer.connect()
  }

  /** Tear down. Idempotent. */
  close(reason = 'closed'): void {
    if (this.closed) return
    this.closed = true
    this.controller.close()
    this.peer.close(reason)
  }

  /** Whether the underlying peer connection is currently connected. */
  isConnected(): boolean {
    return this.peer.getState() === 'connected'
  }
}
