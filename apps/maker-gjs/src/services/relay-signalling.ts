import type { SignallingTransport } from '@pixelrpg/engine'
import { WebSocket } from 'ws'

import { wrapWebSocket } from './lan-signalling.ts'

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
 * and wrap it as a `SignallingTransport`. Throws if the upgrade
 * handshake fails — caller surfaces gracefully ("could not reach
 * relay" toast).
 */
export async function connectRelaySignalling(opts: RelayConnectOptions): Promise<SignallingTransport> {
  const url = `${opts.relayUrl.replace(/\/$/, '')}/room/${encodeURIComponent(opts.roomId)}?role=${opts.role}`
  const ws = new WebSocket(url)
  await new Promise<void>((resolve, reject) => {
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
