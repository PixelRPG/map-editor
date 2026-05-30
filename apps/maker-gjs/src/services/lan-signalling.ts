import type { SignallingMessage, SignallingTransport } from '@pixelrpg/engine'
import { WebSocket, type WebSocketServer as WsServer } from 'ws'

import { WebSocketServer } from 'ws'

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
 */
export function wrapWebSocket(ws: Pick<WebSocket, 'send' | 'close' | 'on'>): SignallingTransport {
  let inboundHandler: ((msg: SignallingMessage) => void) | null = null
  let closed = false

  ws.on('message', (raw: Buffer | string, isBinary?: boolean) => {
    if (isBinary === true) return
    const text = typeof raw === 'string' ? raw : raw.toString()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      // Drop malformed frames silently — the relay drops them too.
      return
    }
    if (!isSignallingMessage(parsed)) return
    inboundHandler?.(parsed)
  })

  ws.on('close', () => {
    closed = true
  })

  return {
    send(message: SignallingMessage): void {
      if (closed) return
      try {
        ws.send(JSON.stringify(message))
      } catch {
        /* peer may have closed mid-send — best-effort */
      }
    },
    onMessage(handler: (message: SignallingMessage) => void): void {
      inboundHandler = handler
    },
    close(): void {
      if (closed) return
      closed = true
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
 * `SignallingTransport`. Throws if the connect handshake fails;
 * caller decides whether to retry / surface to UI.
 */
export async function connectLanJoinerTransport(
  hostAddress: string,
  port: number,
): Promise<SignallingTransport> {
  // IPv6 literal addresses must be bracketed inside a URL —
  // `ws://::1:8089/` is ambiguous (port? part of address?), only
  // `ws://[::1]:8089/` parses. Avahi resolves on IPv6 too, so
  // the joiner can receive a `::1` / `fe80::…` address.
  const target = hostAddress.includes(':') && !hostAddress.startsWith('[')
    ? `[${hostAddress}]`
    : hostAddress
  const url = `ws://${target}:${port}/`
  console.log(`[lan-signalling] joiner connecting to ${url}`)
  const ws = new WebSocket(url)
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      ws.off('open', onOpen)
      console.warn(`[lan-signalling] joiner connect failed for ${url}: ${err.message ?? err}`)
      reject(err)
    }
    const onOpen = () => {
      ws.off('error', onError)
      console.log(`[lan-signalling] joiner connected to ${url}`)
      resolve()
    }
    ws.once('open', onOpen)
    ws.once('error', onError)
  })
  return wrapWebSocket(ws)
}
