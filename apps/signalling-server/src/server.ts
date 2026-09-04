import { type WebSocket, WebSocketServer } from 'ws'

import { type LogLevel, logEvent } from './event-log.ts'
import { type ConnectionRequest, extractUrl, parsePath, peekType } from './request-routing.ts'
import { RoomManager } from './room-manager.ts'
import type { SignallingPeer } from './types.ts'

/**
 * Periodic sweep cadence — runs the idle-room reaper. The sweep
 * itself is O(rooms) and only walks the in-memory Map, so 30 s is
 * generous; matched against the room idle window so a dead room
 * is gone at most ~5 m 30 s after its last activity.
 */
const SWEEP_INTERVAL_MS = 30 * 1000

export interface ServerOptions {
  host: string
  port: number
  log?: LogLevel
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

  wss.on('connection', (ws: WebSocket, req: ConnectionRequest) => acceptConnection(rooms, ws, req, logLevel))

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

/** Seat one upgraded socket in its room and relay its frames until it closes. */
function acceptConnection(rooms: RoomManager, ws: WebSocket, req: ConnectionRequest, logLevel: LogLevel): void {
  const parsed = parsePath(extractUrl(req))
  if (!parsed.ok) {
    // verifyClient should have rejected — defensive close.
    ws.close(1008, parsed.reason)
    return
  }
  const { roomId, role } = parsed

  if (!rooms.join(roomId, role, makePeer(ws))) {
    ws.close(1008, 'slot-taken')
    return
  }

  ws.on('message', (raw, isBinary) => {
    // The protocol is text-only — silently drop binary frames.
    if (isBinary) return
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
