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

import type { ProjectSnapshot } from './project-snapshot.ts'
import type { SessionController } from './session-controller.ts'
import {
  createSnapshotRequestOp,
  createSnapshotResponseOp,
  type SessionProtocolOp,
  SNAPSHOT_REQUEST_KIND,
  SNAPSHOT_RESPONSE_KIND,
} from './session-protocol.ts'

export interface SnapshotExchangeOptions {
  /** The SessionController to bind to — provides send + receive. */
  controller: SessionController
  /**
   * Producer for the local project state. Called when the peer
   * sends a snapshot-request. Return `null` to refuse (the
   * requester will see a timeout). v1 always returns the current
   * `engine.captureProjectSnapshot()`.
   */
  captureSnapshot: () => ProjectSnapshot | null
  /**
   * Default timeout for an outgoing request, ms. Defaults to
   * 10 s. Tests pass a small value to cover the timeout path
   * without waiting in real time.
   */
  defaultTimeoutMs?: number
}

interface PendingRequest {
  resolve: (snapshot: ProjectSnapshot) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout> | null
}

export class SnapshotExchange {
  private readonly controller: SessionController
  private readonly captureSnapshot: () => ProjectSnapshot | null
  private readonly defaultTimeoutMs: number
  private pending: PendingRequest | null = null
  private disposed = false

  constructor(opts: SnapshotExchangeOptions) {
    this.controller = opts.controller
    this.captureSnapshot = opts.captureSnapshot
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 10_000
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
        this.resolveResponse(op.payload.snapshot)
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
      return Promise.reject(
        new Error('SnapshotExchange: a snapshot request is already in flight — await it first'),
      )
    }

    return new Promise<ProjectSnapshot>((resolve, reject) => {
      const ms = timeoutMs ?? this.defaultTimeoutMs
      const timer = ms > 0
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
      this.controller.sendSessionProtocol(
        createSnapshotRequestOp({ peerId: '', seq: 0, roomId }),
      )
    })
  }

  /**
   * Cancel any in-flight request and stop processing further
   * inbound messages. Idempotent.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.pending) {
      const p = this.pending
      this.pending = null
      if (p.timer) clearTimeout(p.timer)
      p.reject(new Error('SnapshotExchange: disposed'))
    }
  }

  private respondToRequest(roomId: string): void {
    const snapshot = this.captureSnapshot()
    if (!snapshot) {
      // Nothing to send — let the requester time out. Logging
      // here would be noisy in tests; production callers can
      // surface "host has no project loaded yet" through the UI
      // layer via the awareness presence channel.
      return
    }
    // Tag roomId for symmetry / diagnostics — the controller
    // overwrites peerId+seq anyway.
    void roomId
    this.controller.sendSessionProtocol(
      createSnapshotResponseOp({ peerId: '', seq: 0, snapshot }),
    )
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
    if (p.timer) clearTimeout(p.timer)
    p.resolve(snapshot)
  }
}
