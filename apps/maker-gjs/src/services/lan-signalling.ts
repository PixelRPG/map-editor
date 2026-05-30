import type { SignallingMessage, SignallingTransport } from '@pixelrpg/engine'
import { WebSocket, type WebSocketServer as WsServer } from 'ws'

import { WebSocketServer } from 'ws'

import { CollabTimeoutError, scopedLogger, withTimeout } from './collab-log.ts'

const log = scopedLogger('lan-signalling')

/**
 * Mirror of the engine's `__PIXELRPG_PEER_DEBUG` gate so wire-
 * level diagnostics (every raw WS frame in/out, every send error)
 * land in the same hand-test log stream as the SDP/ICE traces. Off
 * by default; the maker's main.ts flips it on for the v1 cycle.
 */
function wireDebugEnabled(): boolean {
  const g = globalThis as { __PIXELRPG_PEER_DEBUG?: unknown }
  return Boolean(g.__PIXELRPG_PEER_DEBUG)
}

function wlog(role: string, message: string): void {
  if (wireDebugEnabled()) {
    console.log(`[lan-signalling/${role}] ${message}`)
  }
}

let wrapCounter = 0

/**
 * Default deadline for the joiner-side WebSocket open handshake. Five
 * seconds is generous for LAN — the WS upgrade typically completes
 * within tens of ms — but short enough that a misconfigured host
 * surfaces an explicit `CollabTimeoutError` instead of leaving the
 * user staring at a stalled UI.
 */
export const LAN_CONNECT_TIMEOUT_MS = 5_000

/**
 * LAN signalling — one host accepts one joiner over a plain
 * WebSocket. Routes SDP / ICE / bye frames bidirectionally without
 * the room concept (there's only the local pair; the relay-style
 * `apps/signalling-server` exists for cross-network sessions where
 * the two peers can't see each other on mDNS).
 *
 * Wire envelopes match `apps/signalling-server/src/types.ts` so a
 * future LAN-to-relay fallback can reuse the same parser layer
 * without translating.
 *
 * Both `LanHostTransport` and `LanJoinerTransport` implement the
 * platform-indep `SignallingTransport` interface from
 * `@pixelrpg/engine/sync`, so the same `PeerSession` constructor
 * accepts either side.
 *
 * Test strategy: `lan-signalling-wire.test.ts` covers the
 * `wrapServerSocket` / `wrapClientSocket` adapter contract using
 * fake WebSockets. The real Soup-backed ws path is GJS-only and
 * validated via the manual two-instance smoke walk-through.
 */

/**
 * Adapter that wraps a single `ws.WebSocket` instance as a
 * `SignallingTransport`. Used by both the host (one per accepted
 * peer) and the joiner (its own outgoing connection).
 *
 * Buffering invariant — load-bearing:
 *
 *   `ws.on('message', ...)` is registered SYNCHRONOUSLY when this
 *   function runs, but `inboundHandler` only becomes non-null when
 *   the caller invokes `transport.onMessage(handler)`. Between
 *   those two events, any inbound message would be lost — and on
 *   the joiner side those microseconds are real: `wrapWebSocket`
 *   resolves out of the `await connectLanJoinerTransport(...)`
 *   call site, control returns to `SessionService.openSession`,
 *   which creates a `CollabSession`, which creates a `PeerSession`,
 *   whose constructor finally calls `signalling.onMessage(...)`.
 *   Meanwhile on the host side, `wss.on('connection')` fires the
 *   instant the joiner's WS handshake completes; the host's
 *   `PeerSession.connect()` proceeds straight to `createOffer` +
 *   `setLocalDescription` + `signalling.send(sdp)` — frequently
 *   FASTER than the joiner can wire its handler.
 *
 *   The 2026-05-30 hand-test caught exactly this race: joiner's
 *   `[peer-session/joiner] waiting for host SDP offer` confirmed
 *   the handler was wired, host's `sending SDP offer (sdp.length=
 *   1437)` confirmed the send, but no `received SDP offer` ever
 *   appeared on the joiner — because the SDP was delivered to the
 *   `ws.on('message')` callback while `inboundHandler === null`
 *   and was silently dropped.
 *
 *   Fix: buffer parsed inbound messages in `pendingInbound` until
 *   `onMessage` is called, then drain. Anything that arrives after
 *   the handler is wired goes straight through.
 */
export function wrapWebSocket(ws: Pick<WebSocket, 'send' | 'close' | 'on'>): SignallingTransport {
  let inboundHandler: ((msg: SignallingMessage) => void) | null = null
  let closed = false
  const pendingInbound: SignallingMessage[] = []
  const wrapId = `#${++wrapCounter}`
  let rawFrameCount = 0
  let sendCount = 0

  wlog(wrapId, 'wrapped (handler-null; buffering)')

  ws.on('message', (raw: Buffer | string, isBinary?: boolean) => {
    rawFrameCount++
    // Pre-filter raw log: surfaces EVERY frame that hits the WS,
    // regardless of binary/JSON-validity/type. If the user sees
    // this line, the WS layer IS delivering frames; if not, the
    // problem is at the @gjsify/ws or libsoup level (and we'd
    // hand the regression off to @gjsify/ws).
    if (wireDebugEnabled()) {
      const head = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf-8') : String(raw)
      console.log(
        `[lan-signalling/${wrapId}] raw frame #${rawFrameCount} ` +
          `(binary=${isBinary === true}, len=${head.length}): ${head.slice(0, 200)}${head.length > 200 ? '…' : ''}`,
      )
    }
    if (isBinary === true) return
    const text = typeof raw === 'string' ? raw : raw.toString()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      wlog(wrapId, `dropped malformed JSON frame: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    if (!isSignallingMessage(parsed)) {
      wlog(wrapId, `dropped non-signalling frame: type=${(parsed as { type?: unknown })?.type}`)
      return
    }
    if (inboundHandler) {
      wlog(wrapId, `→ deliver to handler (type=${parsed.type})`)
      inboundHandler(parsed)
    } else {
      wlog(wrapId, `→ buffer (handler not wired yet, type=${parsed.type})`)
      pendingInbound.push(parsed)
    }
  })

  ws.on('close', () => {
    wlog(wrapId, `ws closed (delivered ${rawFrameCount} frames, sent ${sendCount}, ${pendingInbound.length} unflushed in buffer)`)
    closed = true
  })

  return {
    send(message: SignallingMessage): void {
      if (closed) {
        wlog(wrapId, `send(${message.type}) called after close — dropped`)
        return
      }
      sendCount++
      try {
        const json = JSON.stringify(message)
        wlog(wrapId, `send #${sendCount} (type=${message.type}, len=${json.length})`)
        ws.send(json)
      } catch (err) {
        wlog(wrapId, `send(${message.type}) THREW: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    onMessage(handler: (message: SignallingMessage) => void): void {
      wlog(wrapId, `onMessage handler installed (draining ${pendingInbound.length} buffered)`)
      inboundHandler = handler
      if (pendingInbound.length > 0) {
        const drain = pendingInbound.splice(0)
        for (const message of drain) handler(message)
      }
    },
    close(): void {
      if (closed) return
      closed = true
      wlog(wrapId, `close() called`)
      try {
        ws.close(1000, 'closed-by-host')
      } catch {
        /* already closed */
      }
    },
  }
}

/** Discriminates a parsed JSON object as a {@link SignallingMessage}. */
function isSignallingMessage(value: unknown): value is SignallingMessage {
  if (!value || typeof value !== 'object') return false
  const t = (value as { type?: unknown }).type
  return t === 'sdp' || t === 'ice-candidate' || t === 'bye'
}

export interface LanHostServerOptions {
  port: number
  /** Bind address. Default `127.0.0.1` — set to `0.0.0.0` for LAN visibility. */
  host?: string
  /**
   * Fires once per accepted peer WebSocket. The host's owning
   * service typically constructs a `PeerSession` + `SessionController`
   * on top. Subsequent connections while one is active are rejected
   * with `1013` (try-again-later) — Pair-Editing is point-to-point.
   */
  onPeerConnected: (transport: SignallingTransport) => void
}

export interface LanHostServerHandle {
  readonly address: { host: string; port: number }
  close(): Promise<void>
}

/**
 * Bind a `WebSocketServer` for joiner connections. Accepts ONE peer
 * at a time — a second connect attempt closes immediately with code
 * `1013` so the joiner-side surfaces "host is busy" rather than
 * stalling on a dead negotiation.
 */
export async function startLanHostServer(opts: LanHostServerOptions): Promise<LanHostServerHandle> {
  const host = opts.host ?? '127.0.0.1'
  const wss: WsServer = new WebSocketServer({
    host,
    port: opts.port,
  })

  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve)
    wss.once('error', reject)
  })

  // Resolve the actually-bound port — when the caller passed 0, the
  // OS picked one; advertise that real value through the handle so
  // the Avahi TXT record + the joiner can find us. `wss.address()`
  // returns `string` for AF_UNIX sockets (we never use those) so
  // narrow to the AddressInfo shape before reading `.port`.
  const boundAddress = wss.address()
  const boundPort =
    boundAddress && typeof boundAddress !== 'string' ? boundAddress.port : opts.port

  let activePeer: WebSocket | null = null

  wss.on('connection', (ws: WebSocket) => {
    if (activePeer) {
      ws.close(1013, 'host-busy')
      return
    }
    activePeer = ws
    ws.on('close', () => {
      if (activePeer === ws) activePeer = null
    })
    opts.onPeerConnected(wrapWebSocket(ws))
  })

  return {
    address: { host, port: boundPort },
    async close() {
      await new Promise<void>((resolve) => wss.close(() => resolve()))
    },
  }
}

/**
 * Open a `WebSocket` to a discovered host and wrap it as a
 * `SignallingTransport`. Rejects with the underlying WS error on
 * handshake failure or with a {@link CollabTimeoutError} if the
 * upgrade hasn't completed within `timeoutMs` (default
 * {@link LAN_CONNECT_TIMEOUT_MS}). Caller decides whether to retry /
 * surface to UI.
 *
 * The timeout matters: pre-2026-05-30 the joiner had no deadline and
 * would sit indefinitely if the WS upgrade silently stalled mid-
 * handshake (kernel-level TCP weirdness, kernel firewall accepting
 * SYN but dropping data, …). Symptom was "joiner connects but nothing
 * happens." Post-fix the joiner surfaces a typed timeout the welcome
 * view can toast.
 */
export async function connectLanJoinerTransport(
  hostAddress: string,
  port: number,
  timeoutMs: number = LAN_CONNECT_TIMEOUT_MS,
): Promise<SignallingTransport> {
  // IPv6 literal addresses must be bracketed inside a URL —
  // `ws://::1:8089/` is ambiguous (port? part of address?), only
  // `ws://[::1]:8089/` parses. Avahi resolves on IPv6 too, so
  // the joiner can receive a `::1` / `fe80::…` address.
  const target = hostAddress.includes(':') && !hostAddress.startsWith('[')
    ? `[${hostAddress}]`
    : hostAddress
  const url = `ws://${target}:${port}/`
  log.info(`joiner connecting to ${url}`)
  const ws = new WebSocket(url)
  const handshake = new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      ws.off('open', onOpen)
      reject(err)
    }
    const onOpen = () => {
      ws.off('error', onError)
      resolve()
    }
    ws.once('open', onOpen)
    ws.once('error', onError)
  })
  try {
    await withTimeout('LAN signalling connect', timeoutMs, handshake, url)
  } catch (err) {
    log.warn(`joiner connect failed for ${url}`, err)
    // If the underlying socket is still pending when we time out,
    // close it so the OS reclaims the FD and the joiner-side state
    // machine doesn't leak a half-open connection.
    if (err instanceof CollabTimeoutError) {
      try {
        ws.close()
      } catch {
        /* already gone */
      }
    }
    throw err
  }
  log.info(`joiner connected to ${url}`)
  return wrapWebSocket(ws)
}
