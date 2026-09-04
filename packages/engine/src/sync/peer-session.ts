import { EventEmitter } from 'excalibur'
import { formatErrorMessage } from '../utils/format-error.ts'

import { DisconnectGrace } from './disconnect-grace.ts'
import { peerLog } from './peer-debug.ts'
import { PendingIceBuffer } from './pending-ice-buffer.ts'
import { resolveRtcFactory } from './rtc-factory.ts'
import {
  CHANNEL_AWARENESS,
  CHANNEL_OP,
  DEFAULT_ICE_SERVERS,
  type PeerRole,
  type PeerSessionEventMap,
  type PeerSessionState,
  type RTCPeerConnectionFactory,
  type SignallingMessage,
  type SignallingTransport,
} from './types.ts'

export interface PeerSessionOptions {
  /**
   * Determines who issues the initial SDP offer (`'host'`) and who
   * waits to answer (`'joiner'`). Both sides exchange ICE candidates
   * symmetrically once the offer/answer pair is set.
   */
  role: PeerRole
  /** Duplex channel the SDP / ICE messages travel on. */
  signalling: SignallingTransport
  /** Injectable for tests. Defaults to `globalThis.RTCPeerConnection`. */
  rtcFactory?: RTCPeerConnectionFactory
  /** Override the default STUN-only ICE config. */
  iceServers?: readonly RTCIceServer[]
  /**
   * Grace period, in ms, before a transient `connectionState ===
   * 'disconnected'` is treated as a hard close. WebRTC uses
   * `disconnected` for a momentary ICE-consent blip (Wi-Fi hiccup,
   * brief packet loss) that usually recovers to `connected` on its
   * own — only `failed` is terminal. Defaults to 5 s. Tests pass `0`
   * to exercise the elapse path on the next macrotask.
   */
  disconnectGraceMs?: number
}

/** Default grace before a transient `disconnected` becomes a hard close. */
const DEFAULT_DISCONNECT_GRACE_MS = 5_000

/**
 * Owns the WebRTC peer-connection for one editor / game session.
 *
 * Lifecycle:
 *
 *  1. Construction — sets up the RTCPeerConnection + two data
 *     channels (reliable `op`, unreliable `awareness`), wires
 *     ICE candidate handling. State: `idle`.
 *
 *  2. `connect()` — host creates an offer, sends it over signalling;
 *     joiner waits for an offer, then answers. Both sides drive
 *     ICE-candidate exchange in parallel. State: `negotiating`.
 *
 *  3. Both channels open — state: `connected`. From here, `sendOp`
 *     and `sendAwareness` work. Inbound frames fire
 *     `op-received` / `awareness-received` events.
 *
 *  4. `close()` — sends a `bye`, drops the peer connection. State:
 *     `closed`. Idempotent.
 *
 * Error handling: any failure during negotiation surfaces as a
 * `state-changed` to `error` plus a synthetic `closed` event so
 * callers don't have to listen on two paths. The transport-side
 * `send` is best-effort; a dropped signalling message during
 * negotiation surfaces as a connection timeout downstream.
 *
 * Threading: every public method is synchronous from the caller's
 * perspective. Internal RTCPeerConnection events fire on the
 * runtime's event loop; this class re-emits them through its own
 * `EventEmitter` after collapsing to the typed surface.
 */
export class PeerSession {
  public readonly events = new EventEmitter<PeerSessionEventMap>()

  private readonly role: PeerRole
  private readonly signalling: SignallingTransport
  private readonly pc: RTCPeerConnection
  private opChannel: RTCDataChannel | null = null
  private awarenessChannel: RTCDataChannel | null = null
  private state: PeerSessionState = 'idle'
  private closed = false
  private iceLocalCount = 0
  private iceRemoteCount = 0
  private readonly pendingIce = new PendingIceBuffer()
  private readonly disconnectGrace: DisconnectGrace

  constructor(opts: PeerSessionOptions) {
    this.role = opts.role
    this.signalling = opts.signalling
    this.disconnectGrace = new DisconnectGrace(opts.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS, () =>
      this.onDisconnectGraceElapsed(),
    )

    const factory = resolveRtcFactory(opts.rtcFactory)
    this.pc = new factory({ iceServers: [...(opts.iceServers ?? DEFAULT_ICE_SERVERS)] })

    // Host creates the channels; joiner attaches in `ondatachannel`.
    // Splitting reliable + unreliable into two channels is what gives
    // the awareness layer its drop-on-overload semantics without
    // stalling the op-log behind it.
    if (this.role === 'host') {
      this.opChannel = this.pc.createDataChannel(CHANNEL_OP, { ordered: true })
      this.awarenessChannel = this.pc.createDataChannel(CHANNEL_AWARENESS, {
        ordered: false,
        maxRetransmits: 0,
      })
      this.wireChannel(this.opChannel)
      this.wireChannel(this.awarenessChannel)
    } else {
      this.pc.ondatachannel = (event) => {
        const channel = event.channel
        if (channel.label === CHANNEL_OP) this.opChannel = channel
        else if (channel.label === CHANNEL_AWARENESS) this.awarenessChannel = channel
        else {
          // Unknown label — protocol mismatch. Surface and ignore.
          this.fail(new Error(`unexpected data channel: ${channel.label}`))
          return
        }
        this.wireChannel(channel)
      }
    }

    this.pc.onicecandidate = (event) => {
      const json = event.candidate?.toJSON() ?? null
      if (json === null) {
        peerLog(this.role, `ICE local: end-of-candidates (sent ${this.iceLocalCount} so far)`)
      } else {
        this.iceLocalCount++
        peerLog(this.role, `ICE local #${this.iceLocalCount}: ${json.candidate ?? '<no candidate string>'}`)
      }
      this.signalling.send({ type: 'ice-candidate', payload: json })
    }
    this.pc.onconnectionstatechange = () => {
      peerLog(this.role, `pc.connectionState → ${this.pc.connectionState}`)
      switch (this.pc.connectionState) {
        case 'connected':
          // Recovered (possibly from a transient `disconnected`) —
          // cancel any pending grace close.
          this.disconnectGrace.cancel()
          break
        case 'failed':
          this.fail(new Error('peer connection failed'))
          break
        case 'disconnected':
          // Transient by spec — see DisconnectGrace.
          if (!this.closed) this.disconnectGrace.schedule()
          break
      }
    }

    this.signalling.onMessage((msg) => this.handleSignal(msg))
  }

  /**
   * Drive the offer / answer exchange. Resolves once the peer
   * connection's ICE-gathering has started — the session is not
   * yet `connected`; listen on `state-changed` for that.
   */
  async connect(): Promise<void> {
    if (this.state !== 'idle') return
    peerLog(this.role, `connect() starting (state ${this.state} → negotiating)`)
    this.transitionTo('negotiating')
    try {
      if (this.role === 'host') {
        peerLog('host', 'createOffer()…')
        const offer = await this.pc.createOffer()
        peerLog('host', `createOffer OK (sdp.length=${offer.sdp?.length ?? 0})`)
        await this.pc.setLocalDescription(offer)
        peerLog('host', 'setLocalDescription(offer) OK')
        // `pc.localDescription` reflects the actual SDP after
        // ICE-restart adjustments; prefer it over the offer object.
        const local = this.pc.localDescription ?? offer
        peerLog('host', `sending SDP offer over signalling (sdp.length=${local.sdp?.length ?? 0})`)
        this.signalling.send({ type: 'sdp', payload: { type: local.type, sdp: local.sdp ?? undefined } })
      } else {
        peerLog('joiner', 'waiting for host SDP offer over signalling')
      }
      // Joiner waits for the host's offer; arrives via `handleSignal`.
    } catch (err) {
      peerLog(this.role, `connect() threw: ${formatErrorMessage(err)}`)
      this.fail(err instanceof Error ? err : new Error(String(err)))
    }
  }

  /** Send an op via the reliable channel. Buffered if the channel is not open yet. */
  sendOp(op: unknown): void {
    this.send(this.opChannel, op, 'op')
  }

  /** Send awareness data via the unreliable channel. */
  sendAwareness(data: unknown): void {
    this.send(this.awarenessChannel, data, 'awareness')
  }

  /** Tear down the connection. Emits `closed` and stops further events. */
  close(reason = 'closed'): void {
    if (this.closed) return
    this.closed = true
    this.disconnectGrace.cancel()
    try {
      this.signalling.send({ type: 'bye', payload: { reason } })
    } catch {
      // Signalling may already be torn down — best-effort.
    }
    try {
      this.signalling.close()
    } catch {
      /* idempotent */
    }
    try {
      this.opChannel?.close()
      this.awarenessChannel?.close()
      this.pc.close()
    } catch {
      /* idempotent */
    }
    this.transitionTo('closed')
    this.events.emit('closed', { reason })
  }

  /** Current session state — handy for UI / tests without listening on the event. */
  getState(): PeerSessionState {
    return this.state
  }

  private send(channel: RTCDataChannel | null, payload: unknown, kind: 'op' | 'awareness'): void {
    if (channel?.readyState !== 'open') {
      // A drop on awareness is fine (the next update supersedes it).
      // A drop on ops would mean state divergence; surface so the
      // caller can retry or escalate.
      if (kind === 'op') {
        peerLog(this.role, `sendOp DROPPED: op channel not open (state=${channel?.readyState ?? 'absent'})`)
        this.events.emit('error', {
          error: new Error(`PeerSession.sendOp: op channel not open (state=${channel?.readyState ?? 'absent'})`),
        })
      } else {
        peerLog(this.role, `sendAwareness DROPPED: channel not open (state=${channel?.readyState ?? 'absent'})`)
      }
      return
    }
    const json = JSON.stringify(payload)
    peerLog(
      this.role,
      `→ channel "${channel.label}" send ${kind} (len=${json.length}, kind=${(payload as { kind?: string })?.kind ?? '<no kind>'})`,
    )
    channel.send(json)
  }

  private wireChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      peerLog(this.role, `channel "${channel.label}" → open`)
      this.maybeMarkConnected()
    }
    channel.onclose = () => {
      peerLog(this.role, `channel "${channel.label}" → close`)
      if (!this.closed) this.close(`channel-${channel.label}-closed`)
    }
    channel.onerror = (event) => {
      const err =
        // RTCErrorEvent has `error`; the W3C type lists it but lib.dom's
        // RTCDataChannelEventMap['error'] is `Event` so the cast is required.
        (event as unknown as { error?: Error }).error ?? new Error(`channel ${channel.label} errored`)
      this.events.emit('error', { error: err })
    }
    channel.onmessage = (event) => {
      const raw = typeof event.data === 'string' ? event.data : ''
      peerLog(this.role, `← channel "${channel.label}" recv frame (len=${raw.length})`)
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch (err) {
        peerLog(this.role, `channel "${channel.label}" dropped malformed JSON: ${formatErrorMessage(err)}`)
        this.events.emit('error', {
          error: new Error(`PeerSession: dropped malformed frame on ${channel.label}`),
        })
        return
      }
      peerLog(
        this.role,
        `channel "${channel.label}" delivered (kind=${(parsed as { kind?: string })?.kind ?? '<no kind>'})`,
      )
      if (channel.label === CHANNEL_OP) this.events.emit('op-received', { op: parsed })
      else if (channel.label === CHANNEL_AWARENESS) this.events.emit('awareness-received', { data: parsed })
    }
  }

  private async handleSignal(msg: SignallingMessage): Promise<void> {
    if (this.closed) return
    try {
      switch (msg.type) {
        case 'sdp': {
          peerLog(this.role, `received SDP ${msg.payload.type} (sdp.length=${msg.payload.sdp?.length ?? 0})`)
          await this.pc.setRemoteDescription(msg.payload)
          peerLog(this.role, `setRemoteDescription(${msg.payload.type}) OK`)
          this.pendingIce.markRemoteDescriptionSet()
          // Guard the await so the common no-buffered-candidate handshake
          // keeps its original microtask timing (no extra tick).
          if (this.pendingIce.size > 0) await this.drainPendingIce()
          if (this.role === 'joiner') {
            peerLog('joiner', 'createAnswer()…')
            const answer = await this.pc.createAnswer()
            peerLog('joiner', `createAnswer OK (sdp.length=${answer.sdp?.length ?? 0})`)
            await this.pc.setLocalDescription(answer)
            peerLog('joiner', 'setLocalDescription(answer) OK')
            const local = this.pc.localDescription ?? answer
            peerLog('joiner', `sending SDP answer over signalling (sdp.length=${local.sdp?.length ?? 0})`)
            this.signalling.send({
              type: 'sdp',
              payload: { type: local.type, sdp: local.sdp ?? undefined },
            })
          }
          break
        }
        case 'ice-candidate': {
          if (msg.payload === null) {
            // Null candidate marks end-of-candidates per W3C spec.
            peerLog(this.role, `ICE remote: end-of-candidates (received ${this.iceRemoteCount} so far)`)
            return
          }
          this.iceRemoteCount++
          peerLog(this.role, `ICE remote #${this.iceRemoteCount}: ${msg.payload.candidate ?? '<no candidate string>'}`)
          if (!this.pendingIce.accept(msg.payload)) {
            peerLog(this.role, `ICE remote #${this.iceRemoteCount}: buffered (no remote description yet)`)
            return
          }
          await this.pc.addIceCandidate(msg.payload)
          break
        }
        case 'bye':
          peerLog(this.role, `received bye: ${msg.payload?.reason ?? '<no reason>'}`)
          this.close(msg.payload?.reason ?? 'peer-bye')
          break
      }
    } catch (err) {
      peerLog(this.role, `handleSignal(${msg.type}) threw: ${formatErrorMessage(err)}`)
      this.fail(err instanceof Error ? err : new Error(String(err)))
    }
  }

  private maybeMarkConnected(): void {
    if (this.state === 'connected' || this.closed) return
    if (this.opChannel?.readyState === 'open' && this.awarenessChannel?.readyState === 'open') {
      this.transitionTo('connected')
    }
  }

  /** Flush ICE candidates buffered before the remote description was set. */
  private async drainPendingIce(): Promise<void> {
    const buffered = this.pendingIce.drain()
    if (buffered.length === 0) return
    peerLog(this.role, `ICE: draining ${buffered.length} buffered candidate(s)`)
    for (const candidate of buffered) {
      try {
        await this.pc.addIceCandidate(candidate)
      } catch (err) {
        // A single bad candidate must not fail the whole connection —
        // the ICE agent tolerates losing one. Log and continue.
        peerLog(this.role, `ICE: buffered candidate rejected: ${formatErrorMessage(err)}`)
      }
    }
  }

  /**
   * The grace window closed. Only act if the connection is STILL
   * disconnected — it usually recovered in the meantime, and the
   * `connected` handler already cancelled the window in that case.
   */
  private onDisconnectGraceElapsed(): void {
    if (this.closed) return
    // Recovered to a non-disconnected state during the grace window?
    // Then leave the connection alone.
    if (this.pc.connectionState === 'disconnected') {
      this.close('peer-disconnected')
    }
  }

  private transitionTo(state: PeerSessionState): void {
    if (this.state === state) return
    peerLog(this.role, `state ${this.state} → ${state}`)
    this.state = state
    this.events.emit('state-changed', { state })
  }

  private fail(error: Error): void {
    if (this.closed) return
    this.events.emit('error', { error })
    this.transitionTo('error')
    this.close(`error: ${error.message}`)
  }
}
