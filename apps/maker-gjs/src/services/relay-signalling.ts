import type { SignallingTransport } from '@pixelrpg/engine'
import { WebSocket } from 'ws'

import { CollabTimeoutError, scopedLogger, withTimeout } from './collab-log.ts'
import { wrapWebSocket } from './lan-signalling.ts'

const log = scopedLogger('relay-signalling')

/**
 * Default deadline for the relay WebSocket upgrade. Ten seconds is
 * longer than {@link LAN_CONNECT_TIMEOUT_MS} because the relay is
 * typically reached over the public internet (DNS lookup, TLS
 * handshake, multi-hop routing).
 */
export const RELAY_CONNECT_TIMEOUT_MS = 10_000

/**
 * Cross-network signalling — both peers connect to the workspace's
 * `@pixelrpg/signalling-server` relay over a plain WebSocket. The
 * relay only routes opaque SDP / ICE / bye envelopes; the
 * `wrapWebSocket` adapter (shared with the LAN path) parses them
 * into the platform-indep `SignallingTransport` shape `PeerSession`
 * consumes.
 *
 * Reuses the entire wrapWebSocket frame-handling code path — the
 * only difference from LAN is the URL.
 */

export interface RelayConnectOptions {
  /** Relay endpoint, e.g. `wss://signalling.pixelrpg.example`. */
  relayUrl: string
  /** Room id pulled from the `pixelrpg://join/<roomid>` link or generated for hosting. */
  roomId: string
  /** Role this peer plays in the room — host issues the offer, joiner answers. */
  role: 'host' | 'joiner'
}

/**
 * Open a WebSocket to the relay's `/room/<roomid>?role=…` endpoint
 * and wrap it as a `SignallingTransport`. Rejects on upgrade failure
 * (caller surfaces "could not reach relay" toast) or on
 * {@link CollabTimeoutError} after `timeoutMs` (default
 * {@link RELAY_CONNECT_TIMEOUT_MS}). The timeout exists for the same
 * reason as in the LAN path — a stalled TLS handshake or HTTP/1.1
 * upgrade that never completes would otherwise leave the joiner UI
 * frozen indefinitely.
 */
export async function connectRelaySignalling(
  opts: RelayConnectOptions,
  timeoutMs: number = RELAY_CONNECT_TIMEOUT_MS,
): Promise<SignallingTransport> {
  const url = `${opts.relayUrl.replace(/\/$/, '')}/room/${encodeURIComponent(opts.roomId)}?role=${opts.role}`
  log.info(`${opts.role} connecting to ${url}`)
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
    await withTimeout('relay signalling connect', timeoutMs, handshake, url)
  } catch (err) {
    log.warn(`${opts.role} connect failed for ${url}`, err)
    if (err instanceof CollabTimeoutError) {
      try {
        ws.close()
      } catch {
        /* already gone */
      }
    }
    throw err
  }
  log.info(`${opts.role} connected to ${url}`)
  return wrapWebSocket(ws)
}

/**
 * Resolve the default relay endpoint from env (or fall back). The
 * env var lets a self-hoster point the maker at their own deployment
 * without rebuilding; the default targets the future
 * `signalling.pixelrpg.example` endpoint the workspace will host.
 */
export function defaultRelayUrl(): string {
  return process.env.PIXELRPG_RELAY_URL ?? 'wss://signalling.pixelrpg.example'
}

/**
 * Generate a fresh, share-friendly room id. Eight lowercase
 * alphanumerics — collision odds across concurrent live rooms are
 * negligible given the 5-minute idle reap (~2.8 × 10¹²
 * possibilities). Avoids ambiguous chars (0/o, 1/l).
 */
export function generateRoomId(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let id = ''
  for (let i = 0; i < 8; i++) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return id
}
