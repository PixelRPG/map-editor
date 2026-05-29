import type { PeerRole, SignallingPeer } from './types.ts'

/** Default idle window before a room with at least one connected peer is reaped. */
const DEFAULT_ROOM_IDLE_MS = 5 * 60 * 1000

/**
 * One signalling room — at most one host + one joiner. The room
 * exists only as long as at least one of them is connected; both
 * gone → room is destroyed by the owning {@link RoomManager}.
 */
interface Room {
  roomId: string
  host: SignallingPeer | null
  joiner: SignallingPeer | null
  lastActivity: number
}

export interface RoomManagerOptions {
  /** Idle window before a half-occupied room is reaped. Default 5 minutes. */
  idleMs?: number
  /** Used by the periodic sweep — overridable for tests. */
  now?: () => number
  /** Diagnostics hook (defaults to no-op). */
  log?: (event: RoomEvent) => void
}

export type RoomEvent =
  | { kind: 'joined'; roomId: string; role: PeerRole }
  | { kind: 'left'; roomId: string; role: PeerRole; reason: 'disconnect' | 'replaced' | 'closed' }
  | { kind: 'message'; roomId: string; from: PeerRole; to: PeerRole; type: string }
  | { kind: 'rejected'; roomId: string; role: PeerRole; reason: 'slot-taken' | 'bad-message' }
  | { kind: 'reaped'; roomId: string; reason: 'idle' | 'empty' }

/**
 * Stateful router. Owns one entry per active `roomId`, fans
 * peer-to-peer messages, and reaps idle rooms via {@link sweep}.
 *
 * Two design choices worth being explicit about:
 *
 *  - **At most one host + one joiner per room.** The PixelRPG v1
 *    pair-editing flow is point-to-point. A second connection
 *    attempt with an already-taken role is rejected (the new peer
 *    is asked to close) rather than silently replacing the old
 *    peer — that would strand the original host mid-edit.
 *
 *  - **Messages never echo to the sender.** A signalling server
 *    that forwarded a peer's own message back to it is a foot-gun
 *    (clients would parse their own ICE candidates). The router
 *    drops self-targeted forwards on the floor.
 */
export class RoomManager {
  private rooms = new Map<string, Room>()
  private readonly idleMs: number
  private readonly now: () => number
  private readonly log: (event: RoomEvent) => void

  constructor(opts: RoomManagerOptions = {}) {
    this.idleMs = opts.idleMs ?? DEFAULT_ROOM_IDLE_MS
    this.now = opts.now ?? Date.now
    this.log = opts.log ?? (() => {})
  }

  get size(): number {
    return this.rooms.size
  }

  /**
   * Register a connecting peer under (`roomId`, `role`). Returns
   * `true` on success; `false` when the role slot is already
   * filled (caller should close the new peer's socket).
   */
  join(roomId: string, role: PeerRole, peer: SignallingPeer): boolean {
    const room = this.rooms.get(roomId) ?? this.createRoom(roomId)
    if (room[role] !== null) {
      this.log({ kind: 'rejected', roomId, role, reason: 'slot-taken' })
      return false
    }
    room[role] = peer
    room.lastActivity = this.now()
    this.log({ kind: 'joined', roomId, role })
    return true
  }

  /**
   * Drop the peer for (`roomId`, `role`). If both slots are now
   * empty the room is destroyed. Reason is logged for telemetry.
   */
  leave(roomId: string, role: PeerRole, reason: 'disconnect' | 'replaced' | 'closed' = 'disconnect'): void {
    const room = this.rooms.get(roomId)
    if (!room || !room[role]) return
    room[role] = null
    room.lastActivity = this.now()
    this.log({ kind: 'left', roomId, role, reason })
    if (room.host === null && room.joiner === null) {
      this.rooms.delete(roomId)
      this.log({ kind: 'reaped', roomId, reason: 'empty' })
    }
  }

  /**
   * Forward `frame` from `(roomId, fromRole)` to the other role
   * in the same room. No-op when the other side is absent — the
   * relay is best-effort; the sender retries via its own
   * application-level logic if needed.
   *
   * `messageType` is the discriminator value extracted from the
   * frame for logging only; the relay does not parse the payload.
   */
  forward(roomId: string, fromRole: PeerRole, frame: string, messageType: string): void {
    const room = this.rooms.get(roomId)
    if (!room) return
    const toRole: PeerRole = fromRole === 'host' ? 'joiner' : 'host'
    const target = room[toRole]
    room.lastActivity = this.now()
    if (!target) return
    target.send(frame)
    this.log({ kind: 'message', roomId, from: fromRole, to: toRole, type: messageType })
  }

  /**
   * Reap rooms idle longer than `idleMs`. Intended to be invoked
   * by a periodic timer from the owning server.
   */
  sweep(): void {
    const threshold = this.now() - this.idleMs
    for (const [roomId, room] of this.rooms) {
      if (room.lastActivity > threshold) continue
      room.host?.close()
      room.joiner?.close()
      this.rooms.delete(roomId)
      this.log({ kind: 'reaped', roomId, reason: 'idle' })
    }
  }

  private createRoom(roomId: string): Room {
    const room: Room = { roomId, host: null, joiner: null, lastActivity: this.now() }
    this.rooms.set(roomId, room)
    return room
  }
}
