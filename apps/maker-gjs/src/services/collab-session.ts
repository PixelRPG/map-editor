import type {
  AwarenessPeerInfo,
  Engine,
  ProjectOp,
  ProjectSnapshot,
  SignallingTransport,
  SpriteSetAddChunkOp,
  SpriteSetAddPayload,
  SpriteSetUpdateChunkOp,
  SpriteSetUpdatePayload,
} from '@pixelrpg/engine'
import {
  AwarenessManager,
  ChunkReassembler,
  captureProjectSnapshot,
  chunkSpriteSetAdd,
  chunkSpriteSetUpdate,
  isProjectOp,
  isSessionProtocolOp,
  type PeerRole,
  PeerSession,
  type PeerSessionState,
  PreAttachOpBuffer,
  RemoteCursorRenderer,
  SessionController,
  SnapshotExchange,
  type SnapshotOpWatermark,
  SPRITESET_ADD_CHUNK_KIND,
  SPRITESET_UPDATE_CHUNK_KIND,
  SpriteSetAddReassembler,
} from '@pixelrpg/engine'

import { CollabTimeoutError, scopedLogger, withTimeout } from './collab-log.ts'

const log = scopedLogger('collab-session')

/**
 * Distinct accent palette for collaborators (Adwaita-ish), deliberately
 * excluding the AI assistant's default purple (`#9141ac`) so a human peer
 * and the AI don't collide. Each peer's colour is its peerId hashed into
 * this palette — stable across reconnects, distinct between peers.
 */
const PEER_COLOURS = ['#3584e4', '#33d17a', '#f6d32d', '#ff7800', '#e01b24', '#c061cb', '#986a44', '#33c7de']

function colourForPeer(peerId: string): string {
  let hash = 0
  for (let i = 0; i < peerId.length; i++) hash = (hash * 31 + peerId.charCodeAt(i)) >>> 0
  return PEER_COLOURS[hash % PEER_COLOURS.length]
}

/**
 * Default deadline for the WebRTC handshake — from the moment
 * `peer.connect()` is called to the moment both data channels open
 * and the peer's state transitions to `'connected'`. Generous to
 * accommodate slow ICE on busy networks, but short enough to fail
 * fast on a misconfigured relay or a network-unreachable peer.
 *
 * Pre-2026-05-30 there was no deadline here at all. The joiner-side
 * `collab.start()` would resolve as soon as ICE GATHERING started
 * (PeerSession's `connect()` contract) and `requestSnapshot()` would
 * await the host's response — which never arrived if the actual SDP
 * round-trip silently failed. Symptom: "joiner WS connects but
 * nothing else happens." Now: the joiner times out after 15s with
 * a typed CollabTimeoutError naming the unmet condition.
 */
export const PEER_CONNECT_TIMEOUT_MS = 15_000

export interface CollabSessionOptions {
  /**
   * Optional — when omitted the session starts in an "engine-
   * less" state: handshake + awareness work, snapshot requests
   * work, but op-sync + cursor render don't until
   * {@link CollabSession.attachEngine} is called. The sandbox
   * joiner flow uses this: connect first, pull the host's
   * snapshot, write it to a sandbox directory, load the engine,
   * THEN attach.
   *
   * Host paths always pass it up-front; joiner paths attach
   * after the sandbox project loads.
   */
  engine?: Engine
  role: PeerRole
  signalling: SignallingTransport
  /** Stable id for this peer — stamped onto every emitted Operation. */
  peerId: string
  /**
   * Display info broadcast on session start so the peer's UI can
   * render our cursor + name. Default colours are picked from the
   * Adwaita accent palette so peers without explicit config still
   * land on a recognisable hue.
   */
  localInfo?: AwarenessPeerInfo
  /**
   * Stable id for the session — used as the `roomId` tag on
   * snapshot requests. Defaults to `''` when omitted (single
   * pair session per process; tagging is diagnostic).
   */
  roomId?: string
  /**
   * Override the WebRTC negotiation deadline. Production default is
   * {@link PEER_CONNECT_TIMEOUT_MS}; tests pass small values so a
   * `FakeRTCPeerConnection` that never opens its channels fails
   * fast.
   */
  peerConnectTimeoutMs?: number
  /**
   * Inject a custom {@link RTCPeerConnection} factory — forwarded
   * verbatim to {@link PeerSession}. Production omits this so the
   * shared `globalThis.RTCPeerConnection` (wired by `main.ts`'s
   * `@gjsify/webrtc/register` import) handles the negotiation. Tests
   * pass `rtcFactoryFor(new FakeRTCPeerConnection())` so the WebRTC
   * layer can be exercised without GStreamer.
   */
  rtcFactory?: ConstructorParameters<typeof PeerSession>[0]['rtcFactory']
}

/**
 * Top-level glue holding the active Pair-Editing session together.
 *
 * Owns one `PeerSession` (raw WebRTC + signalling) and lazily
 * builds the engine-dependent pieces (`SessionController`,
 * `RemoteCursorRenderer`, engine pointer-source) when an `Engine`
 * is provided — either via the constructor option or via
 * {@link attachEngine} after construction.
 *
 * Three lifetimes coexist:
 *
 *   - **Always**: `PeerSession`, `AwarenessManager`,
 *     `SnapshotExchange`. These work without an engine.
 *   - **Once engine attached**: `SessionController` (commands
 *     in/out), `RemoteCursorRenderer` (paints peers' cursors in
 *     the canvas), local pointer-source (broadcasts our cursor).
 *
 * Side-effect: the maker's entrypoint (`src/main.ts`) is responsible
 * for importing `@gjsify/webrtc/register` so `globalThis.RTCPeerConnection`
 * is wired before the first session opens. The register module is
 * GJS-only (imports `gi://Gst`, etc.) — keeping the import out of
 * this module keeps the Node test bundle building cleanly.
 */
export class CollabSession {
  public readonly peer: PeerSession
  public readonly awareness: AwarenessManager
  public readonly snapshotExchange: SnapshotExchange
  /** Set once {@link attachEngine} runs. `null` in the joiner-pre-snapshot phase. */
  public controller: SessionController | null = null
  public cursorRenderer: RemoteCursorRenderer | null = null
  /**
   * Sink for inbound project-level ops (`__project/*` — cast
   * mutations). Set by the maker so the CastController can apply them
   * to its `GameProjectData` + refresh the Cast view. These ride the
   * always-present op channel and work WITHOUT an engine (cast editing
   * has no live scene), so they're handled here rather than in the
   * engine-tied SessionController.
   */
  public onProjectOpReceived: ((op: ProjectOp) => void) | null = null
  /**
   * Sink for a completed sprite-set-import transfer. Set by the maker
   * so the CastController can write the image + descriptor into the
   * project and register the set. Fed by the chunk reassembler once all
   * chunks of one transfer arrive.
   */
  public onSpriteSetAddReceived: ((payload: SpriteSetAddPayload) => void) | null = null
  /**
   * Sink for a completed sprite-set DESCRIPTOR update (rename / animation
   * edit / tile-property change — no image bytes). Set by the maker so the
   * CastController can overwrite the descriptor of a set it already has.
   * Fed by a dedicated reassembler once all chunks of one transfer arrive.
   */
  public onSpriteSetUpdateReceived: ((payload: SpriteSetUpdatePayload) => void) | null = null
  private closed = false
  private engine: Engine | null = null
  private readonly peerId: string
  private readonly roomId: string
  private readonly peerConnectTimeoutMs: number
  private projectSeq = 0
  private transferCounter = 0
  /**
   * Holding pen for scene Command ops that arrive before
   * {@link attachEngine} builds the SessionController (the joiner's
   * snapshot → sandbox → engine-init window, which takes seconds).
   * Drained + replayed through the controller on attach; see
   * {@link attachEngine} for the dedupe/idempotency reasoning.
   */
  private readonly preAttachBuffer = new PreAttachOpBuffer()
  /**
   * Watermark carried by the snapshot we loaded (joiner side) — the
   * host's next command seq at capture start. Buffered ops below it
   * are already reflected in the snapshot and are skipped on replay.
   */
  private snapshotWatermark: SnapshotOpWatermark | null = null
  private readonly spriteSetReassembler = new SpriteSetAddReassembler()
  private readonly spriteSetUpdateReassembler = new ChunkReassembler<SpriteSetUpdatePayload>()
  private readonly subscriptions: Array<() => void> = []

  constructor(opts: CollabSessionOptions) {
    this.peerId = opts.peerId
    this.roomId = opts.roomId ?? ''
    this.peerConnectTimeoutMs = opts.peerConnectTimeoutMs ?? PEER_CONNECT_TIMEOUT_MS
    this.peer = new PeerSession({
      role: opts.role,
      signalling: opts.signalling,
      rtcFactory: opts.rtcFactory,
    })

    // Default display info — caller can override via `localInfo`. The
    // colour is derived from the peerId so each collaborator gets a
    // distinct, stable accent (cursor + selection rings on peers' views).
    const localInfo: AwarenessPeerInfo = opts.localInfo ?? {
      displayName: opts.peerId,
      color: colourForPeer(opts.peerId),
    }
    this.awareness = new AwarenessManager({
      localPeerId: opts.peerId,
      localInfo,
      send: (message) => this.peer.sendAwareness(message),
    })
    // Inbound awareness frames arrive via the unreliable channel.
    const awarenessSub = this.peer.events.on('awareness-received', ({ data }) => {
      this.awareness.handleInbound(data)
    })
    this.subscriptions.push(() => awarenessSub.close())

    // Subscribe to peer error events so any failure inside
    // PeerSession (malformed JSON on wire, channel-send while not
    // open, sdp/ice processing throw, RTC connectionState 'failed')
    // lands in the operator-visible log AS A TYPED MESSAGE instead
    // of going through the upstream @gjsify/dom-events EventTarget
    // catch and rendering as `{}`. Adding the subscription also
    // satisfies the standard "error events should have a listener"
    // invariant — PeerSession's emitter is silent when no listener
    // is registered (no implicit fallback to console).
    const peerErrorSub = this.peer.events.on('error', ({ error }) => {
      log.warn('peer emitted error', error)
    })
    this.subscriptions.push(() => peerErrorSub.close())

    // Snapshot exchange is engine-independent — uses raw `sendOp`
    // for the protocol frames + a captureSnapshot closure that
    // returns null when no engine is attached. CollabSession
    // routes inbound session-protocol ops here directly (the
    // command-path filter in SessionController also skips them,
    // but works even when the controller hasn't been built yet).
    this.snapshotExchange = new SnapshotExchange({
      peerId: opts.peerId,
      send: (op) => this.peer.sendOp(op),
      captureSnapshot: async () => {
        if (!this.engine) return null
        // Read the command-seq watermark SYNCHRONOUSLY before the
        // (async) capture touches any state: every op we sent with
        // `seq < nextSeq` was applied to our engine before this line
        // ran, so its effect is guaranteed inside the snapshot and the
        // joiner can skip its buffered copy. Ops sequenced during the
        // capture replay on the joiner — safe, because every built-in
        // command's apply is idempotent (see attachEngine).
        const watermark: SnapshotOpWatermark | null = this.controller
          ? { peerId: this.peerId, nextSeq: this.controller.peekNextSeq() }
          : null
        const snapshot = await captureProjectSnapshot(this.engine)
        if (!snapshot) return null
        return watermark ? { ...snapshot, opWatermark: watermark } : snapshot
      },
    })
    const opSub = this.peer.events.on('op-received', ({ op }) => {
      if (isSessionProtocolOp(op)) {
        this.snapshotExchange.handle(op)
        return
      }
      // Project-level ops apply even with no engine attached (cast
      // editing has no scene) — hand them to the maker-side sink.
      // Drop our own echoes defensively (point-to-point shouldn't
      // loop them back, but mirrors SessionController's guard).
      if (isProjectOp(op) && (op as ProjectOp).peerId !== this.peerId) {
        // Sprite-set imports arrive chunked — reassemble before
        // surfacing the (heavy, binary) payload to its own sink.
        if ((op as ProjectOp).kind === SPRITESET_ADD_CHUNK_KIND) {
          const payload = this.spriteSetReassembler.accept(op as SpriteSetAddChunkOp)
          if (payload) this.onSpriteSetAddReceived?.(payload)
        } else if ((op as ProjectOp).kind === SPRITESET_UPDATE_CHUNK_KIND) {
          // Descriptor-only updates (rename / animation / tile-prop) are
          // also chunked — a fat tileset descriptor can exceed the SCTP
          // single-send ceiling.
          const payload = this.spriteSetUpdateReassembler.accept(op as SpriteSetUpdateChunkOp)
          if (payload) this.onSpriteSetUpdateReceived?.(payload)
        } else {
          this.onProjectOpReceived?.(op as ProjectOp)
        }
        return
      }
      // Scene Command ops are consumed by the SessionController —
      // which only exists once attachEngine() runs. Buffer them in
      // the meantime (joiner pre-attach window) so a host paint /
      // place / undo during snapshot-load + engine-init isn't lost;
      // attachEngine replays the buffer in arrival order. Own echoes
      // are skipped defensively (mirrors SessionController's guard).
      if (!this.controller && (op as { peerId?: unknown }).peerId !== this.peerId) {
        this.preAttachBuffer.push(op)
      }
    })
    this.subscriptions.push(() => opSub.close())

    if (opts.engine) this.attachEngine(opts.engine)
  }

  /**
   * Wire the engine-dependent layers — command sync via
   * SessionController, remote-cursor rendering, local cursor
   * pointer-source. Call EXACTLY once; throws on second attach.
   *
   * Typical sandbox-joiner flow:
   *
   *   1. `new CollabSession({ engine: undefined, ... })`
   *   2. `await session.start()`            ← handshake + presence
   *   3. `await session.requestSnapshot()`  ← pull host's state
   *   4. write snapshot to sandbox dir; load engine from there
   *   5. `session.attachEngine(engine)`     ← commands + cursors start flowing
   *
   * Host flow remains unchanged: pass `engine` in the constructor;
   * attach happens implicitly.
   *
   * Scene Command ops received between `start()` and `attachEngine()`
   * are buffered (see {@link PreAttachOpBuffer}) and replayed here in
   * arrival order, so a host paint / place / undo during the joiner's
   * snapshot-load + engine-init window is not lost.
   *
   * Dedupe: the snapshot may already contain a buffered op's effect
   * (host painted, then serviced our snapshot request — the op was
   * still delivered). The snapshot's `opWatermark` (host's next
   * command seq at capture start) lets us skip exactly those ops.
   * Ops at-or-above the watermark replay; a command the host executed
   * DURING its async capture can be both inside the snapshot and
   * replayed, which is safe because every built-in command converges
   * under re-apply:
   *
   *   - `tile.paint` apply sets the sprite at (tile, layer) —
   *     replacing what's there; applying twice yields the same state.
   *   - `tile.erase` apply clears the slot — idempotent.
   *   - `object.place` apply replaces an existing placement with the
   *     same id (`addPlacement`'s replace branch) — the replayed
   *     placement is byte-identical to the snapshot's, so the replace
   *     is a no-op (and replay never calls `revert`, so the known
   *     place-replace revert flaw — revert deletes instead of
   *     restoring — is not reachable from here; a LIVE revert op
   *     arriving later corresponds to a real host undo, where
   *     deleting the placement is the converged outcome).
   *   - `object.remove` apply filters by id — idempotent.
   *   - `direction: 'revert'` replays restore captured previous state
   *     (paint/erase) or add/remove by stable id — all idempotent.
   */
  attachEngine(engine: Engine): void {
    if (this.closed) throw new Error('CollabSession: attachEngine called after close()')
    if (this.engine) throw new Error('CollabSession: engine already attached')
    this.engine = engine
    this.controller = new SessionController({
      engine,
      session: this.peer,
      peerId: this.peerId,
      // CollabSession already routes session-protocol ops to the
      // exchange (see `op-received` subscription in the constructor).
      // SessionController's own filter drops them via the no-hook
      // path; we deliberately don't double-route through here.
    })
    // Replay ops buffered during the pre-attach window BEFORE any live
    // op can interleave (this method is synchronous — the controller's
    // own `op-received` subscription can't fire until we return to the
    // event loop). Arrival order on the ordered-reliable channel equals
    // the host's send order, so replaying in buffer order preserves
    // host-side causality.
    if (this.preAttachBuffer.dropped > 0) {
      log.warn(`pre-attach buffer overflowed — ${this.preAttachBuffer.dropped} oldest op(s) were dropped`)
    }
    const buffered = this.preAttachBuffer.drain(this.snapshotWatermark)
    if (buffered.length > 0) {
      log.info(`replaying ${buffered.length} buffered pre-attach op(s)`)
      for (const op of buffered) this.controller.applyRemoteOperation(op)
    }
    this.cursorRenderer = new RemoteCursorRenderer(engine, this.awareness)
    // Bridge engine pointer → awareness cursor stream. The engine
    // hook fires on every Excalibur `pointermove`; the manager
    // throttles to ~33 Hz so the unreliable channel doesn't flood.
    const cursorDispose = engine.onPointerMoved(({ sceneId, worldX, worldY }) => {
      this.awareness.sendCursor({ sceneId, x: worldX, y: worldY })
    })
    this.subscriptions.push(() => cursorDispose())
    // Bridge engine selection → awareness selection stream, so peers see
    // what we've selected (rendered in our colour on their side).
    const selectionDispose = engine.onSelectionChanged((placementIds) => {
      this.awareness.sendSelection({ placementIds })
    })
    this.subscriptions.push(() => selectionDispose())
  }

  /**
   * Drive the WebRTC handshake to a fully-connected state.
   *
   * Resolves once the underlying {@link PeerSession} transitions to
   * `'connected'` — i.e. both data channels are open and ready for
   * traffic. Rejects with a {@link CollabTimeoutError} if the
   * negotiation doesn't reach `'connected'` within
   * {@link PEER_CONNECT_TIMEOUT_MS} (or the override passed via
   * {@link CollabSessionOptions.peerConnectTimeoutMs}).
   *
   * Why wait for `'connected'`, not just `peer.connect()`?
   * `PeerSession.connect()` resolves once ICE gathering kicks off —
   * which happens almost immediately for the host, and instantly
   * for the joiner (its role is to wait for the host's offer).
   * Without an extra wait, callers (notably {@link requestSnapshot})
   * would start sending traffic on still-closed channels.
   *
   * Once `'connected'`, an initial `presence` frame goes out so the
   * remote peer's roster + cursor UI populate immediately. Repeat
   * announces are cheap — the receiver dedupes by comparing against
   * its tracked state.
   */
  async start(): Promise<void> {
    const announceOnConnect = this.peer.events.on('state-changed', ({ state }) => {
      if (state === 'connected') this.awareness.announce()
    })
    this.subscriptions.push(() => announceOnConnect.close())

    try {
      await withTimeout('CollabSession peer.connect', this.peerConnectTimeoutMs, this.peer.connect())
      // peer.connect() resolves on ICE-gather-started, not connected.
      // Wait for the actual `'connected'` state under the same deadline
      // (minus what peer.connect() already consumed — we don't track
      // elapsed precisely; the remaining budget is approximately
      // `timeout - 0`, which is fine for the typical sub-second LAN).
      await withTimeout('CollabSession reach connected state', this.peerConnectTimeoutMs, this.waitForConnected())
    } catch (err) {
      log.warn('start() failed during peer negotiation', err)
      throw err
    }
    // If `waitForConnected` resolved synchronously (already connected
    // before we subscribed), the announce-on-connect listener never
    // fired. Fire once immediately so late wires don't lose the
    // first presence frame.
    if (this.peer.getState() === 'connected') this.awareness.announce()
  }

  /**
   * Resolve once {@link PeerSession} state is `'connected'`; reject
   * on any terminal state (`'closed'`, `'error'`). Used by
   * {@link start} to gate on the actual handshake completion rather
   * than ICE-gather-started.
   */
  private waitForConnected(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const current = this.peer.getState()
      if (current === 'connected') {
        resolve()
        return
      }
      if (current === 'closed' || current === 'error') {
        reject(new Error(`CollabSession: peer is already "${current}"`))
        return
      }
      const sub = this.peer.events.on('state-changed', ({ state }: { state: PeerSessionState }) => {
        if (state === 'connected') {
          sub.close()
          resolve()
        } else if (state === 'closed' || state === 'error') {
          sub.close()
          reject(new Error(`CollabSession: peer transitioned to "${state}" before connect`))
        }
      })
    })
  }

  /**
   * Joiner-side convenience: pull the host's current project state.
   * Resolves with the parsed {@link ProjectSnapshot}; the caller
   * (typically the maker's sandbox-write step) is responsible for
   * landing it on disk + opening it as the active project.
   *
   * Times out after `timeoutMs` (default 10 s) — long enough for
   * a fat snapshot over a slow LAN, short enough to surface a
   * stalled host before the user gives up.
   *
   * Engine-independent: works in the pre-attach phase. The host
   * peer responds from its own captureProjectSnapshot regardless
   * of whether the joiner has an engine yet.
   *
   * Side effect: records the snapshot's `opWatermark` so
   * {@link attachEngine} can skip buffered pre-attach ops whose
   * effects the snapshot already contains.
   */
  async requestSnapshot(timeoutMs?: number): Promise<ProjectSnapshot> {
    const snapshot = await this.snapshotExchange.request(this.roomId, timeoutMs)
    this.snapshotWatermark = snapshot.opWatermark ?? null
    return snapshot
  }

  /**
   * Broadcast a project-level op (cast mutation) to the peer. The
   * caller builds the op content (it owns the character data); this
   * stamps the peer id + a per-peer sequence and sends it on the
   * reliable op channel. No-op once closed. Works without an engine.
   */
  sendProjectOp(build: (ctx: { peerId: string; seq: number }) => ProjectOp): void {
    if (this.closed) return
    this.peer.sendOp(build({ peerId: this.peerId, seq: this.projectSeq++ }))
  }

  /**
   * Broadcast a sprite-set import to peers, chunked so the image bytes
   * clear the SCTP single-send ceiling. Each chunk is a normal project
   * op (own peer id + seq); the receiver reassembles by transfer id.
   * No-op once closed.
   */
  sendSpriteSetAdd(payload: SpriteSetAddPayload): void {
    if (this.closed) return
    const transferId = `${this.peerId}:s${this.transferCounter++}`
    for (const chunk of chunkSpriteSetAdd({ transferId, payload })) {
      this.peer.sendOp({ ...chunk, peerId: this.peerId, seq: this.projectSeq++ })
    }
  }

  /**
   * Broadcast a sprite-set DESCRIPTOR update (rename / animation edit /
   * tile-property change) to peers — chunked like the add, but carrying
   * only the descriptor (no image bytes; the image already exists on the
   * peer). No-op once closed.
   */
  sendSpriteSetUpdate(payload: SpriteSetUpdatePayload): void {
    if (this.closed) return
    const transferId = `${this.peerId}:u${this.transferCounter++}`
    for (const chunk of chunkSpriteSetUpdate({ transferId, payload })) {
      this.peer.sendOp({ ...chunk, peerId: this.peerId, seq: this.projectSeq++ })
    }
  }

  /** Whether `attachEngine` has been called yet. */
  hasEngine(): boolean {
    return this.engine !== null
  }

  /** Whether the underlying peer connection is currently connected. */
  isConnected(): boolean {
    return this.peer.getState() === 'connected'
  }

  /** Tear down. Idempotent. */
  close(reason = 'closed'): void {
    if (this.closed) return
    this.closed = true
    // Best-effort leave — if the channel is still open the peer
    // drops our cursor immediately; otherwise PeerSession's 'closed'
    // event is the fallback.
    try {
      this.awareness.leave()
    } catch {
      /* channel may already be torn down */
    }
    for (const dispose of this.subscriptions) {
      try {
        dispose()
      } catch {
        /* best-effort */
      }
    }
    this.subscriptions.length = 0
    this.preAttachBuffer.clear()
    this.spriteSetReassembler.clear()
    this.spriteSetUpdateReassembler.clear()
    this.cursorRenderer?.close()
    this.cursorRenderer = null
    this.snapshotExchange.dispose()
    this.controller?.close()
    this.controller = null
    this.peer.close(reason)
  }
}
