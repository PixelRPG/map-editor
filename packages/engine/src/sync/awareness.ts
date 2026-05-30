/**
 * Awareness layer — "who's here, what are they doing right now"
 *
 * Lives on top of the unreliable channel exposed by
 * {@link PeerSession.sendAwareness} / `awareness-received`. The
 * transport already enforces drop-on-overload semantics for the
 * underlying SCTP channel, so this module focuses on:
 *
 *  - Typing the wire envelope (`AwarenessMessage`) so producers +
 *    consumers don't reinvent it.
 *  - Tracking remote peer state so UI consumers can iterate "every
 *    peer's current cursor / selection / display info" without
 *    threading state through every callback.
 *  - Throttling outgoing cursor updates so a 60-Hz mouse drag does
 *    not flood the unreliable channel with redundant frames.
 *
 * Concurrency model: every method runs on the engine thread (single-
 * threaded JS). No locks, no reentrancy guards — emit handlers must
 * NOT call back into `AwarenessManager.send*` synchronously or the
 * manager will recurse.
 */

export interface AwarenessPeerInfo {
  /** Human-readable label shown next to the cursor / in roster lists. */
  readonly displayName: string
  /** CSS-style colour token (`#rrggbb`) used to colour the cursor + chip. */
  readonly color: string
}

export interface AwarenessCursor {
  /** Stable id of the scene the peer's cursor is over. */
  readonly sceneId: string
  /** World-space pixel coordinates. Sub-pixel allowed. */
  readonly x: number
  readonly y: number
}

export interface AwarenessSelection {
  /** Stable placement ids currently selected by the peer. May be empty. */
  readonly placementIds: readonly string[]
}

/**
 * Discriminated union of every awareness frame. Each variant carries
 * the originating peer's id explicitly so receivers don't have to
 * thread sender metadata through a side channel.
 *
 * Variants:
 *
 *  - `presence` — the peer joined the awareness scope or its display
 *    info changed. Always sent at start-of-session so late-joiners
 *    learn the existing roster from each peer's first heartbeat.
 *
 *  - `cursor` — pointer moved. Throttled by the producer; the
 *    receiver caches the latest only (a missed frame is fine —
 *    next one supersedes it).
 *
 *  - `selection` — placement-id set changed.
 *
 *  - `leave` — peer explicitly disconnects (UI removes the cursor
 *    immediately rather than waiting for the connection-close timeout).
 */
export type AwarenessMessage =
  | { type: 'presence'; peerId: string; info: AwarenessPeerInfo }
  | { type: 'cursor'; peerId: string; cursor: AwarenessCursor }
  | { type: 'selection'; peerId: string; selection: AwarenessSelection }
  | { type: 'leave'; peerId: string }

/**
 * Per-peer aggregate the {@link AwarenessManager} maintains. Each
 * field tracks the most recent update of its type; cursor/selection
 * are nullable because a peer may have announced presence without
 * yet moving the pointer or selecting anything.
 */
export interface AwarenessPeerState {
  readonly peerId: string
  readonly info: AwarenessPeerInfo
  readonly cursor: AwarenessCursor | null
  readonly selection: AwarenessSelection | null
  /** Wall-clock ms of the last received update — UI uses for "idle" fade. */
  readonly lastUpdate: number
}

export interface AwarenessEventMap {
  /** A peer's tracked state changed (cursor moved, selection toggled, presence updated). */
  'peer-changed': AwarenessPeerState
  /** A peer left the session — UI removes its cursor / chip. */
  'peer-left': { peerId: string }
}

/**
 * Default throttle window for outgoing cursor updates. Keeps the
 * unreliable channel below ~33 Hz even on a 240-Hz mouse, which the
 * SCTP layer can comfortably absorb while still feeling live.
 */
const DEFAULT_CURSOR_THROTTLE_MS = 30

/**
 * Validates a parsed inbound message before applying it. Defends
 * against the relay/transport handing us a buffer that happens to
 * parse as JSON but isn't a real awareness frame (third-party noise
 * on the same data channel, future schema versions, etc.).
 */
export function isAwarenessMessage(value: unknown): value is AwarenessMessage {
  if (!value || typeof value !== 'object') return false
  const m = value as { type?: unknown; peerId?: unknown }
  if (typeof m.peerId !== 'string' || m.peerId.length === 0) return false
  switch (m.type) {
    case 'presence': {
      const info = (m as { info?: unknown }).info
      if (!info || typeof info !== 'object') return false
      const { displayName, color } = info as { displayName?: unknown; color?: unknown }
      return typeof displayName === 'string' && typeof color === 'string'
    }
    case 'cursor': {
      const cursor = (m as { cursor?: unknown }).cursor
      if (!cursor || typeof cursor !== 'object') return false
      const { sceneId, x, y } = cursor as { sceneId?: unknown; x?: unknown; y?: unknown }
      return typeof sceneId === 'string' && Number.isFinite(x) && Number.isFinite(y)
    }
    case 'selection': {
      const sel = (m as { selection?: unknown }).selection
      if (!sel || typeof sel !== 'object') return false
      const { placementIds } = sel as { placementIds?: unknown }
      return Array.isArray(placementIds) && placementIds.every((id) => typeof id === 'string')
    }
    case 'leave':
      return true
    default:
      return false
  }
}

export interface AwarenessManagerOptions {
  /** Stable id of the local peer — stamped onto every outgoing message. */
  readonly localPeerId: string
  /** Local display info — broadcast on `announce()`. */
  readonly localInfo: AwarenessPeerInfo
  /**
   * Sends a serialized {@link AwarenessMessage} on the unreliable
   * channel. Provided by `CollabSession` — it forwards to
   * `PeerSession.sendAwareness`.
   */
  readonly send: (message: AwarenessMessage) => void
  /**
   * Wall-clock source used for both `lastUpdate` stamps and cursor
   * throttling. Tests pass a fake; production passes `Date.now`.
   */
  readonly now?: () => number
  /**
   * Minimum gap between two outgoing `cursor` frames. Defaults to
   * 30 ms ≈ 33 Hz, comfortable for SCTP + visibly smooth.
   */
  readonly cursorThrottleMs?: number
}

type Listener<T> = (payload: T) => void

/**
 * Application-layer awareness state machine. One instance per
 * {@link CollabSession} (host or joiner).
 *
 * Outgoing surface:
 *  - {@link announce} — broadcast our presence (call once at session start)
 *  - {@link sendCursor} — throttled cursor-position broadcast
 *  - {@link sendSelection} — selection-set broadcast (already cheap)
 *  - {@link leave} — explicit leave broadcast (call on session close)
 *
 * Incoming surface:
 *  - {@link handleInbound} — feed every `awareness-received` payload here
 *  - {@link on} — subscribe to typed `peer-changed` / `peer-left` events
 *  - {@link getPeers} / {@link getPeer} — read tracked state
 *
 * Listeners must NOT call back into `send*` synchronously — the
 * manager dispatches on the engine thread, so a recursive call
 * would re-enter the throttle/state machine mid-update.
 */
export class AwarenessManager {
  private readonly listeners = new Map<keyof AwarenessEventMap, Set<Listener<unknown>>>()
  private readonly peers = new Map<string, AwarenessPeerState>()
  private readonly now: () => number
  private readonly cursorThrottleMs: number

  // `-Infinity` so the FIRST call always passes the throttle check
  // — regardless of where the wall-clock starts. A literal `0` would
  // accidentally throttle the first frame when `now()` itself returns
  // something close to 0 (test clocks, monotonic clocks reset at
  // process start, etc.).
  private lastCursorSentMs = -Infinity
  private pendingCursor: AwarenessCursor | null = null

  constructor(private readonly opts: AwarenessManagerOptions) {
    this.now = opts.now ?? Date.now
    this.cursorThrottleMs = opts.cursorThrottleMs ?? DEFAULT_CURSOR_THROTTLE_MS
  }

  // ────────────────────────────────────────────────────────────
  // Outgoing
  // ────────────────────────────────────────────────────────────

  /**
   * Broadcast our presence + display info. Called once per session
   * start AND whenever the local user's display info changes
   * (e.g. they rename themselves mid-session). Repeated calls with
   * an unchanged payload are cheap — the receiver dedupes by
   * comparing against the stored state.
   */
  announce(): void {
    this.opts.send({ type: 'presence', peerId: this.opts.localPeerId, info: this.opts.localInfo })
  }

  /**
   * Throttled cursor broadcast. Calls in rapid succession coalesce
   * to AT MOST one network frame per `cursorThrottleMs` window;
   * the next call after the window flushes immediately. The
   * receiver's state is **edge-correct** — the last cursor passed
   * to `sendCursor` always reaches the wire (we flush the
   * coalesced `pendingCursor` on the next call past the window).
   */
  sendCursor(cursor: AwarenessCursor): void {
    const now = this.now()
    const gap = now - this.lastCursorSentMs
    if (gap >= this.cursorThrottleMs) {
      this.lastCursorSentMs = now
      this.pendingCursor = null
      this.opts.send({ type: 'cursor', peerId: this.opts.localPeerId, cursor })
      return
    }
    // Within the throttle window — coalesce. The next sendCursor /
    // flushCursor call past the window will pick up `pendingCursor`.
    this.pendingCursor = cursor
  }

  /**
   * Send any cursor coalesced by the throttle. Call from a timer
   * driven by the UI (e.g. once per animation frame) to ensure the
   * peer sees the final pointer position even when the local mouse
   * stops moving mid-throttle-window.
   */
  flushCursor(): void {
    if (!this.pendingCursor) return
    const now = this.now()
    const gap = now - this.lastCursorSentMs
    if (gap < this.cursorThrottleMs) return
    const cursor = this.pendingCursor
    this.pendingCursor = null
    this.lastCursorSentMs = now
    this.opts.send({ type: 'cursor', peerId: this.opts.localPeerId, cursor })
  }

  /**
   * Broadcast our selection set. Always sent (no throttle) — the
   * caller already debounces selection events at the UI layer, and
   * the payload is tiny.
   */
  sendSelection(selection: AwarenessSelection): void {
    this.opts.send({ type: 'selection', peerId: this.opts.localPeerId, selection })
  }

  /** Explicit leave broadcast. Call on session close so peers can drop our cursor right away. */
  leave(): void {
    this.opts.send({ type: 'leave', peerId: this.opts.localPeerId })
  }

  // ────────────────────────────────────────────────────────────
  // Incoming
  // ────────────────────────────────────────────────────────────

  /**
   * Apply an inbound awareness frame to the tracked-peer state.
   * Untyped payloads (third-party noise on the channel, future
   * schema versions) are silently dropped — `isAwarenessMessage`
   * is the discriminator.
   *
   * Echo-suppression: a message stamped with our own peer id is
   * ignored. Peer-to-peer RTCDataChannel never loops back, so this
   * is defence against a future hub-style transport.
   */
  handleInbound(payload: unknown): void {
    if (!isAwarenessMessage(payload)) return
    if (payload.peerId === this.opts.localPeerId) return
    switch (payload.type) {
      case 'presence':
        this.updatePeer(payload.peerId, { info: payload.info })
        return
      case 'cursor':
        this.updatePeer(payload.peerId, { cursor: payload.cursor })
        return
      case 'selection':
        this.updatePeer(payload.peerId, { selection: payload.selection })
        return
      case 'leave':
        this.peers.delete(payload.peerId)
        this.emit('peer-left', { peerId: payload.peerId })
        return
    }
  }

  // ────────────────────────────────────────────────────────────
  // Reading state
  // ────────────────────────────────────────────────────────────

  /** Snapshot of every tracked remote peer's current state. */
  getPeers(): AwarenessPeerState[] {
    return Array.from(this.peers.values())
  }

  getPeer(peerId: string): AwarenessPeerState | null {
    return this.peers.get(peerId) ?? null
  }

  on<K extends keyof AwarenessEventMap>(event: K, listener: Listener<AwarenessEventMap[K]>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener as Listener<unknown>)
    return () => set?.delete(listener as Listener<unknown>)
  }

  // ────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────

  private updatePeer(
    peerId: string,
    patch: Partial<Pick<AwarenessPeerState, 'info' | 'cursor' | 'selection'>>,
  ): void {
    const prev = this.peers.get(peerId)
    const info = patch.info ?? prev?.info ?? { displayName: peerId, color: '#888' }
    const cursor = patch.cursor !== undefined ? patch.cursor : prev?.cursor ?? null
    const selection = patch.selection !== undefined ? patch.selection : prev?.selection ?? null
    const next: AwarenessPeerState = {
      peerId,
      info,
      cursor,
      selection,
      lastUpdate: this.now(),
    }
    this.peers.set(peerId, next)
    this.emit('peer-changed', next)
  }

  private emit<K extends keyof AwarenessEventMap>(event: K, payload: AwarenessEventMap[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const listener of set) (listener as Listener<AwarenessEventMap[K]>)(payload)
  }
}
