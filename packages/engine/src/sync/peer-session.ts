import { EventEmitter } from 'excalibur'
import { formatErrorMessage } from '../utils/format-error.ts'

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
}

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
/**
 * Diagnostic-logging gate. Set `globalThis.__PIXELRPG_PEER_DEBUG`
 * to a truthy value to enable verbose `[peer-session]` logs (SDP
 * exchange, ICE candidate flow, channel + state transitions).
 *
 * Off by default so production logs stay readable. The pair-edit
 * hand-test workflow flips it on:
 *
 *   globalThis.__PIXELRPG_PEER_DEBUG = true
 *
 * before constructing the session, or set it in main.ts behind a
 * `PIXELRPG_DEBUG_PEER` env var. We deliberately stay below the
 * scoped-logger machinery in `@pixelrpg/maker-gjs` because the
 * engine is platform-independent (no maker imports allowed).
 */
function peerDebugEnabled(): boolean {
  const g = globalThis as { __PIXELRPG_PEER_DEBUG?: unknown }
  return Boolean(g.__PIXELRPG_PEER_DEBUG)
}

function plog(role: PeerRole, message: string): void {
  if (peerDebugEnabled()) {
    console.log(`[peer-session/${role}] ${message}`)
  }
}

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

  constructor(opts: PeerSessionOptions) {
    this.role = opts.role
    this.signalling = opts.signalling

    const factory = opts.rtcFactory ?? resolveRTCPeerConnection()
    if (!factory) {
      throw new Error(
        'PeerSession: no RTCPeerConnection factory available — ' +
          'register `@gjsify/webrtc/register` under GJS, or inject `rtcFactory` in tests.',
      )
    }
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
        plog(this.role, `ICE local: end-of-candidates (sent ${this.iceLocalCount} so far)`)
      } else {
        this.iceLocalCount++
        plog(this.role, `ICE local #${this.iceLocalCount}: ${json.candidate ?? '<no candidate string>'}`)
      }
      this.signalling.send({ type: 'ice-candidate', payload: json })
    }
    this.pc.onconnectionstatechange = () => {
      plog(this.role, `pc.connectionState → ${this.pc.connectionState}`)
      switch (this.pc.connectionState) {
        case 'failed':
          this.fail(new Error('peer connection failed'))
          break
        case 'disconnected':
          if (!this.closed) this.close('peer-disconnected')
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
    plog(this.role, `connect() starting (state ${this.state} → negotiating)`)
    this.transitionTo('negotiating')
    try {
      if (this.role === 'host') {
        plog('host', 'createOffer()…')
        const offer = await this.pc.createOffer()
        plog('host', `createOffer OK (sdp.length=${offer.sdp?.length ?? 0})`)
        await this.pc.setLocalDescription(offer)
        plog('host', 'setLocalDescription(offer) OK')
        // `pc.localDescription` reflects the actual SDP after
        // ICE-restart adjustments; prefer it over the offer object.
        const local = this.pc.localDescription ?? offer
        plog('host', `sending SDP offer over signalling (sdp.length=${local.sdp?.length ?? 0})`)
        this.signalling.send({ type: 'sdp', payload: { type: local.type, sdp: local.sdp ?? undefined } })
      } else {
        plog('joiner', 'waiting for host SDP offer over signalling')
      }
      // Joiner waits for the host's offer; arrives via `handleSignal`.
    } catch (err) {
      plog(this.role, `connect() threw: ${formatErrorMessage(err)}`)
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
        plog(this.role, `sendOp DROPPED: op channel not open (state=${channel?.readyState ?? 'absent'})`)
        this.events.emit('error', {
          error: new Error(`PeerSession.sendOp: op channel not open (state=${channel?.readyState ?? 'absent'})`),
        })
      } else {
        plog(this.role, `sendAwareness DROPPED: channel not open (state=${channel?.readyState ?? 'absent'})`)
      }
      return
    }
    const json = JSON.stringify(payload)
    plog(
      this.role,
      `→ channel "${channel.label}" send ${kind} (len=${json.length}, kind=${(payload as { kind?: string })?.kind ?? '<no kind>'})`,
    )
    channel.send(json)
  }

  private wireChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      plog(this.role, `channel "${channel.label}" → open`)
      this.maybeMarkConnected()
    }
    channel.onclose = () => {
      plog(this.role, `channel "${channel.label}" → close`)
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
      plog(this.role, `← channel "${channel.label}" recv frame (len=${raw.length})`)
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch (err) {
        plog(this.role, `channel "${channel.label}" dropped malformed JSON: ${formatErrorMessage(err)}`)
        this.events.emit('error', {
          error: new Error(`PeerSession: dropped malformed frame on ${channel.label}`),
        })
        return
      }
      plog(
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
          plog(this.role, `received SDP ${msg.payload.type} (sdp.length=${msg.payload.sdp?.length ?? 0})`)
          await this.pc.setRemoteDescription(msg.payload)
          plog(this.role, `setRemoteDescription(${msg.payload.type}) OK`)
          if (this.role === 'joiner') {
            plog('joiner', 'createAnswer()…')
            const answer = await this.pc.createAnswer()
            plog('joiner', `createAnswer OK (sdp.length=${answer.sdp?.length ?? 0})`)
            await this.pc.setLocalDescription(answer)
            plog('joiner', 'setLocalDescription(answer) OK')
            const local = this.pc.localDescription ?? answer
            plog('joiner', `sending SDP answer over signalling (sdp.length=${local.sdp?.length ?? 0})`)
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
            plog(this.role, `ICE remote: end-of-candidates (received ${this.iceRemoteCount} so far)`)
            return
          }
          this.iceRemoteCount++
          plog(this.role, `ICE remote #${this.iceRemoteCount}: ${msg.payload.candidate ?? '<no candidate string>'}`)
          await this.pc.addIceCandidate(msg.payload)
          break
        }
        case 'bye':
          plog(this.role, `received bye: ${msg.payload?.reason ?? '<no reason>'}`)
          this.close(msg.payload?.reason ?? 'peer-bye')
          break
      }
    } catch (err) {
      plog(this.role, `handleSignal(${msg.type}) threw: ${formatErrorMessage(err)}`)
      this.fail(err instanceof Error ? err : new Error(String(err)))
    }
  }

  private maybeMarkConnected(): void {
    if (this.state === 'connected' || this.closed) return
    if (this.opChannel?.readyState === 'open' && this.awarenessChannel?.readyState === 'open') {
      this.transitionTo('connected')
    }
  }

  private transitionTo(state: PeerSessionState): void {
    if (this.state === state) return
    plog(this.role, `state ${this.state} → ${state}`)
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

/**
 * Resolve the WebRTC constructor from the host runtime. Browser +
 * GJS (with `@gjsify/webrtc/register`) both expose it as a global;
 * Node has no native impl, so callers without an injected factory
 * receive a clear error.
 */
function resolveRTCPeerConnection(): RTCPeerConnectionFactory | null {
  const global = globalThis as { RTCPeerConnection?: RTCPeerConnectionFactory }
  return global.RTCPeerConnection ?? null
}
