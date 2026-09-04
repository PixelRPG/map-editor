import type { PeerRole, SignallingMessage } from './types.ts'

/**
 * `ws.WebSocketServer`'s `'connection'` event passes a Node-shaped
 * `http.IncomingMessage` under Node, but @gjsify/ws passes the raw
 * `Soup.ServerMessage` (which has `get_uri()` instead of `.url`).
 * The two surfaces overlap on nothing, so we sniff for whichever is
 * actually present and normalise to a single string.
 */
export interface ConnectionRequest {
  url?: string | undefined
  get_uri?: () => { get_path: () => string | null; get_query: () => string | null }
}

const PATH_PATTERN = /^\/room\/([A-Za-z0-9_-]{1,64})$/

/** A URL that addresses one room slot. */
export interface ParsedPath {
  ok: true
  roomId: string
  role: PeerRole
}

/** A URL that does not, with the reason the peer is told. */
export interface RejectedPath {
  ok: false
  reason: string
}

/** Normalise either runtime's request object to a `path[?query]` string. */
export function extractUrl(req: ConnectionRequest): string {
  if (typeof req.url === 'string') return req.url
  if (typeof req.get_uri === 'function') {
    const uri = req.get_uri()
    const path = uri.get_path() ?? '/'
    const query = uri.get_query()
    return query ? `${path}?${query}` : path
  }
  return ''
}

/** Read `(roomId, role)` out of a `/room/<id>?role=host|joiner` URL. */
export function parsePath(url: string): ParsedPath | RejectedPath {
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

/**
 * The discriminator of a wire frame, for logging and for deciding whether
 * the frame is worth relaying at all. The relay never looks at the payload.
 */
export function peekType(frame: string): string | null {
  try {
    const parsed = JSON.parse(frame) as Partial<SignallingMessage>
    if (typeof parsed?.type !== 'string') return null
    return parsed.type
  } catch {
    return null
  }
}
