/**
 * Snapshot exchange — engine-side glue that turns the wire-level
 * session-protocol messages (see {@link session-protocol.ts}) into
 * a request/response pair.
 *
 * Decoupled from CollabSession so it can be:
 *
 *   - Driven directly from an integration test with two
 *     `SessionController`s (no CollabSession needed).
 *   - Composed inside CollabSession for the production maker
 *     flow.
 *   - Used in any future surface that needs project-state
 *     transfer (e.g. a future "remote session inspect" debug
 *     tool).
 *
 * Pair-Editing v1 is point-to-point: at most one snapshot request
 * is in flight at a time. A second concurrent `request` rejects
 * immediately rather than queuing — the caller is expected to
 * wait for the first to settle.
 *
 * Lifetime: register via `SessionController.onSessionProtocol`.
 * Tear down with `dispose()` to cancel any in-flight request and
 * stop accepting inbound messages.
 */

import { formatError } from '../utils/format-error.ts'
import { buildChunkEnvelopes, CHUNK_SIZE_BYTES, ChunkReassembler } from './chunking.ts'
import type { ProjectSnapshot } from './project-snapshot.ts'
import {
  createSnapshotChunkOp,
  createSnapshotRequestOp,
  type SessionProtocolOp,
  SNAPSHOT_CHUNK_KIND,
  SNAPSHOT_REQUEST_KIND,
  SNAPSHOT_RESPONSE_KIND,
} from './session-protocol.ts'

/**
 * Per-chunk payload size in bytes. The envelope around each chunk
 * (`{kind,payload:{chunkIndex,totalChunks,data},peerId,seq}`)
 * adds ~120 bytes of overhead; 16 KiB of `data` keeps every wire
 * frame well under the WebRTC SCTP `max-message-size` default of
 * 64 KiB (RFC 8841 § 6.1). Going larger than the SCTP ceiling
 * silently drops the message on GStreamer webrtcbin — verified in
 * the 2026-06-01 pixel-rpg/map-editor hand-test, where a 1.27 MB
 * single-message snapshot response never reached the joiner while
 * 109-byte awareness frames and the 106-byte snapshot-request op
 * traversed the same channel fine.
 *
 * 16 KiB chunks produce ~80 sends for a 1.2 MB snapshot — well
 * within ordered-reliable SCTP throughput limits.
 */
const SNAPSHOT_CHUNK_BYTES = CHUNK_SIZE_BYTES

/** Fixed transfer id — the snapshot path runs one transfer per pending request. */
const SNAPSHOT_TRANSFER_ID = 'snapshot'

/**
 * Public reference to the canonical chunk-size used by
 * {@link SnapshotExchange} — exported so tests can assert against
 * the same constant and consumers that wrap the exchange (e.g. for
 * a HTTP-fallback transport) can match the boundary exactly.
 */
export const SNAPSHOT_CHUNK_SIZE_BYTES = SNAPSHOT_CHUNK_BYTES

export interface SnapshotExchangeOptions {
  /**
   * Stable id stamped onto every outgoing protocol envelope.
   * Receivers don't use it for routing (single pending request at
   * a time) but it shows up in wire-level diagnostics.
   */
  peerId: string
  /**
   * Transport callback. The exchange hands fully-stamped session-
   * protocol ops; the callback's only job is "put this on the
   * reliable channel" — typically `(op) => peerSession.sendOp(op)`.
   *
   * Decoupled from `SessionController` so the snapshot flow works
   * even before an engine is attached (joiner sandbox flow: connect
   * → request snapshot → write to disk → THEN load engine).
   */
  send: (op: SessionProtocolOp) => void
  /**
   * Producer for the local project state. Called when the peer
   * sends a snapshot-request. Return `null` to refuse (the
   * requester will see a timeout). Hosts pass
   * `() => captureProjectSnapshot(engine)` (async — reads
   * sprite-set PNGs off disk for the binary-asset transfer);
   * joiners typically return null synchronously (they don't host
   * their own state).
   *
   * Supports both sync (`ProjectSnapshot | null`) and async
   * (`Promise<ProjectSnapshot | null>`) return values so test
   * callers can pass a literal without juggling promises while
   * production callers can do I/O during capture.
   */
  captureSnapshot: () => ProjectSnapshot | null | Promise<ProjectSnapshot | null>
  /**
   * Default timeout for an outgoing request, ms. Defaults to
   * 10 s. Tests pass a small value to cover the timeout path
   * without waiting in real time.
   */
  defaultTimeoutMs?: number
  /**
   * Override the per-chunk payload size. Production omits this
   * and uses {@link SNAPSHOT_CHUNK_SIZE_BYTES} (16 KiB). Tests
   * pass a small value (e.g. 64 bytes) so the chunking path is
   * exercised without needing a megabyte of fixture data.
   */
  chunkSizeBytes?: number
}

interface PendingRequest {
  resolve: (snapshot: ProjectSnapshot) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * Buffer for an in-flight chunked snapshot response. Sized at
 * `totalChunks` once the first chunk arrives; `chunks[i]` holds
 * each chunk's UTF-8 substring or `undefined` while still in
 * transit. `received` counts the populated slots so we don't
 * have to re-scan the array per arrival.
 */
export class SnapshotExchange {
  private readonly peerId: string
  private readonly send: (op: SessionProtocolOp) => void
  private readonly captureSnapshot: () => ProjectSnapshot | null | Promise<ProjectSnapshot | null>
  private readonly defaultTimeoutMs: number
  private readonly chunkSizeBytes: number
  private pending: PendingRequest | null = null
  // Shared validated reassembler (chunking.ts); one transfer at a time
  // keyed by the fixed id — a new request resets it.
  private readonly chunks = new ChunkReassembler<ProjectSnapshot>()
  private localSeq = 0
  private disposed = false

  constructor(opts: SnapshotExchangeOptions) {
    this.peerId = opts.peerId
    this.send = opts.send
    this.captureSnapshot = opts.captureSnapshot
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 10_000
    this.chunkSizeBytes = opts.chunkSizeBytes ?? SNAPSHOT_CHUNK_BYTES
  }

  private nextSeq(): number {
    return this.localSeq++
  }

  /**
   * Feed every inbound session-protocol op through this method —
   * typically wired via `SessionController.onSessionProtocol`.
   * Unknown / future kinds under the protocol prefix are silently
   * ignored.
   */
  handle(op: SessionProtocolOp): void {
    if (this.disposed) return
    switch (op.kind) {
      case SNAPSHOT_REQUEST_KIND:
        this.respondToRequest(op.payload.roomId)
        return
      case SNAPSHOT_RESPONSE_KIND:
        // Legacy single-message path — still accepted so a peer
        // running an older client (or sending a snapshot that
        // fits in one frame and bypasses chunking) interops.
        this.resolveResponse(op.payload.snapshot)
        return
      case SNAPSHOT_CHUNK_KIND:
        this.handleChunk(op.payload)
        return
    }
  }

  /**
   * Request the peer's snapshot. Resolves when the response
   * arrives or rejects on timeout / dispose / concurrent-request.
   *
   * `roomId` is echoed back by the host — used by the caller for
   * logging / metric tagging; not load-bearing for the v1 wire
   * shape (single pending request, no multiplex).
   */
  request(roomId: string, timeoutMs?: number): Promise<ProjectSnapshot> {
    if (this.disposed) {
      return Promise.reject(new Error('SnapshotExchange: disposed'))
    }
    if (this.pending) {
      return Promise.reject(new Error('SnapshotExchange: a snapshot request is already in flight — await it first'))
    }

    return new Promise<ProjectSnapshot>((resolve, reject) => {
      const ms = timeoutMs ?? this.defaultTimeoutMs
      const timer =
        ms > 0
          ? setTimeout(() => {
              if (this.pending?.timer === timer) {
                const p = this.pending
                this.pending = null
                p.reject(new Error(`SnapshotExchange: request timed out after ${ms} ms`))
              }
            }, ms)
          : null
      this.pending = { resolve, reject, timer }
      // Wire-send happens AFTER the pending registration so a
      // synchronous-handler test scenario (where the response
      // arrives before sendOp returns) can't race past the
      // assignment.
      this.send(createSnapshotRequestOp({ peerId: this.peerId, seq: this.nextSeq(), roomId }))
    })
  }

  /**
   * Cancel any in-flight request and stop processing further
   * inbound messages. Idempotent.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.chunks.clear()
    if (this.pending) {
      const p = this.pending
      this.pending = null
      if (p.timer) clearTimeout(p.timer)
      p.reject(new Error('SnapshotExchange: disposed'))
    }
  }

  private respondToRequest(roomId: string): void {
    // Resolve `captureSnapshot` as a promise so the same code-path
    // handles both sync (`return literal`) and async (`async () =>
    // captureProjectSnapshot(engine)`) producers. Errors during
    // capture (e.g. a sprite-set PNG missing on the host's disk)
    // are logged but otherwise swallowed — the requester sees a
    // request timeout and retries / surfaces an error. We don't
    // have a wire-level "request rejected" op yet.
    let resolved: Promise<ProjectSnapshot | null>
    try {
      const result = this.captureSnapshot()
      resolved = Promise.resolve(result)
    } catch (err) {
      console.warn('[SnapshotExchange] captureSnapshot threw synchronously:', formatError(err))
      return
    }
    void resolved
      .then((snapshot) => {
        if (this.disposed) return
        if (!snapshot) {
          // Nothing to send — let the requester time out. Logging
          // here would be noisy in tests; production callers can
          // surface "host has no project loaded yet" through the
          // UI layer via the awareness presence channel.
          return
        }
        // roomId echoed for diagnostics; not load-bearing in v1.
        void roomId

        // Serialise once, then chunk by configured byte boundary.
        // We always chunk (even for tiny snapshots that fit in 1
        // chunk) so the receiver has a single code-path to
        // handle. Sending as a sequence of `SNAPSHOT_CHUNK_KIND`
        // ops keeps every wire frame below the WebRTC SCTP
        // `max-message-size` ceiling — the 2026-06-01 hand-test
        // bug was that single-message sends larger than 64 KiB
        // were silently dropped by GStreamer webrtcbin (RFC 8841
        // default).
        const json = JSON.stringify(snapshot)
        for (const chunk of buildChunkEnvelopes(SNAPSHOT_TRANSFER_ID, json, this.chunkSizeBytes)) {
          this.send(
            createSnapshotChunkOp({
              peerId: this.peerId,
              seq: this.nextSeq(),
              chunkIndex: chunk.chunkIndex,
              totalChunks: chunk.totalChunks,
              data: chunk.data,
            }),
          )
        }
      })
      .catch((err) => {
        console.warn('[SnapshotExchange] snapshot capture/send failed:', formatError(err))
      })
  }

  private handleChunk(payload: { chunkIndex: number; totalChunks: number; data: string }): void {
    if (!this.pending) {
      // Unsolicited chunk — drop. A host that streams without
      // a matching request is misbehaving.
      return
    }
    const result = this.chunks.accept({ transferId: SNAPSHOT_TRANSFER_ID, ...payload })
    if (result.status === 'pending') return
    if (result.status === 'error') {
      // Protocol violation or parse failure — fail the pending request
      // (the strict contract the snapshot path always had; the shared
      // reassembler carries the same validation now).
      this.failPending(new Error(`SnapshotExchange: ${result.reason}`))
      return
    }
    this.resolveResponse(result.payload)
  }

  private resolveResponse(snapshot: ProjectSnapshot): void {
    if (!this.pending) {
      // Unsolicited response — drop. A host that sends without
      // a matching request is misbehaving; the right answer is
      // to ignore + let the connection time out gracefully.
      return
    }
    const p = this.pending
    this.pending = null
    this.chunks.clear()
    if (p.timer) clearTimeout(p.timer)
    p.resolve(snapshot)
  }

  /** Reject the pending request and clear any partial buffer. */
  private failPending(err: Error): void {
    this.chunks.clear()
    if (!this.pending) return
    const p = this.pending
    this.pending = null
    if (p.timer) clearTimeout(p.timer)
    p.reject(err)
  }
}
