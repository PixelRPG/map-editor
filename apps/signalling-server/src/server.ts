import { WebSocketServer, type WebSocket } from 'ws'

import { RoomManager, type RoomEvent } from './room-manager.ts'
import type { PeerRole, SignallingMessage, SignallingPeer } from './types.ts'

/**
 * `ws.WebSocketServer`'s `'connection'` event passes a Node-shaped
 * `http.IncomingMessage` under Node, but @gjsify/ws passes the raw
 * `Soup.ServerMessage` (which has `get_uri()` instead of `.url`).
 * The two surfaces overlap on nothing, so we sniff for whichever is
 * actually present and normalise to a single string.
 */
interface ConnectionRequest {
  url?: string | undefined
  get_uri?: () => { get_path: () => string | null; get_query: () => string | null }
}

/**
 * Periodic sweep cadence — runs the idle-room reaper. The sweep
 * itself is O(rooms) and only walks the in-memory Map, so 30 s is
 * generous; matched against the room idle window so a dead room
 * is gone at most ~5 m 30 s after its last activity.
 */
const SWEEP_INTERVAL_MS = 30 * 1000

const PATH_PATTERN = /^\/room\/([A-Za-z0-9_-]{1,64})$/

export interface ServerOptions {
  host: string
  port: number
  log?: 'quiet' | 'info' | 'debug'
}

export interface ServerHandle {
  readonly address: { host: string; port: number }
  close(): Promise<void>
}

/**
 * Boot the signalling-server: bind a `WebSocketServer` to
 * `(host, port)`, wire each upgrade to a {@link RoomManager} entry
 * keyed by the URL's `/room/<roomid>` segment + `?role=` query.
 *
 * Returns a handle the caller can use to stop it. The implementation
 * is intentionally stateless beyond the room map — restarting the
 * process is the recovery story for any failure mode.
 */
export async function startServer(opts: ServerOptions): Promise<ServerHandle> {
  const logLevel = opts.log ?? 'info'
  const rooms = new RoomManager({ log: (event) => logEvent(event, logLevel) })

  const wss = new WebSocketServer({
    host: opts.host,
    port: opts.port,
    verifyClient: (info, cb) => {
      const decision = parsePath(info.req.url ?? '')
      if (decision.ok) {
        cb(true)
      } else {
        cb(false, 400, decision.reason)
      }
    },
  })

  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve)
    wss.once('error', reject)
  })

  wss.on('connection', (ws: WebSocket, req: ConnectionRequest) => {
    const parsed = parsePath(extractUrl(req))
    if (!parsed.ok) {
      // verifyClient should have rejected — defensive close.
      ws.close(1008, parsed.reason)
      return
    }
    const { roomId, role } = parsed

    const peer = makePeer(ws)
    const accepted = rooms.join(roomId, role, peer)
    if (!accepted) {
      ws.close(1008, 'slot-taken')
      return
    }

    ws.on('message', (raw, isBinary) => {
      if (isBinary) {
        // The protocol is text-only — silently drop binary frames.
        return
      }
      const frame = raw.toString()
      const type = peekType(frame)
      if (!type) {
        if (logLevel === 'debug') {
          console.warn(`[signalling] dropped malformed frame from ${roomId}/${role}`)
        }
        return
      }
      rooms.forward(roomId, role, frame, type)
    })

    ws.on('close', () => {
      rooms.leave(roomId, role, 'disconnect')
    })

    ws.on('error', () => {
      // close-handler will run anyway; nothing to do here.
    })
  })

  const sweep = setInterval(() => rooms.sweep(), SWEEP_INTERVAL_MS)
  // GJS's setInterval has no unref(); Node's polyfill returns a
  // Timeout with one. Cast keeps both runtimes happy without
  // pulling node:timers.
  const maybeUnref = sweep as unknown as { unref?: () => void }
  maybeUnref.unref?.()

  return {
    address: { host: opts.host, port: opts.port },
    async close() {
      clearInterval(sweep)
      await new Promise<void>((resolve) => wss.close(() => resolve()))
    },
  }
}

interface ParsedPath {
  ok: true
  roomId: string
  role: PeerRole
}

interface RejectedPath {
  ok: false
  reason: string
}

function extractUrl(req: ConnectionRequest): string {
  if (typeof req.url === 'string') return req.url
  if (typeof req.get_uri === 'function') {
    const uri = req.get_uri()
    const path = uri.get_path() ?? '/'
    const query = uri.get_query()
    return query ? `${path}?${query}` : path
  }
  return ''
}

function parsePath(url: string): ParsedPath | RejectedPath {
  let parsed: URL
  try {
    parsed = new URL(url, 'http://relay')
  } catch {
    return { ok: false, reason: 'bad-url' }
  }
  const m = PATH_PATTERN.exec(parsed.pathname)
  if (!m) return { ok: false, reason: 'bad-path' }
  const roomId = m[1]
  if (!roomId) return { ok: false, reason: 'bad-room-id' }
  const role = parsed.searchParams.get('role')
  if (role !== 'host' && role !== 'joiner') return { ok: false, reason: 'bad-role' }
  return { ok: true, roomId, role }
}

function peekType(frame: string): string | null {
  try {
    const parsed = JSON.parse(frame) as Partial<SignallingMessage>
    if (typeof parsed?.type !== 'string') return null
    return parsed.type
  } catch {
    return null
  }
}

function makePeer(ws: WebSocket): SignallingPeer {
  return {
    send(frame: string) {
      ws.send(frame)
    },
    close() {
      ws.close(1000, 'closed-by-relay')
    },
  }
}

function logEvent(event: RoomEvent, level: 'quiet' | 'info' | 'debug'): void {
  if (level === 'quiet') return
  if (event.kind === 'message' && level !== 'debug') return
  console.log(`[signalling] ${formatEvent(event)}`)
}

function formatEvent(event: RoomEvent): string {
  switch (event.kind) {
    case 'joined':
      return `joined ${event.roomId} as ${event.role}`
    case 'left':
      return `left ${event.roomId} (${event.role}, ${event.reason})`
    case 'message':
      return `${event.roomId}: ${event.from} → ${event.to} (${event.type})`
    case 'rejected':
      return `rejected ${event.roomId}/${event.role}: ${event.reason}`
    case 'reaped':
      return `reaped ${event.roomId} (${event.reason})`
  }
}
