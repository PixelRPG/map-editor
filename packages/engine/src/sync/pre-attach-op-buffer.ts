/**
 * Pre-attach op buffer — joiner-side holding pen for scene Command
 * operations that arrive before the engine (and therefore the
 * {@link SessionController}) exists.
 *
 * The sandbox-joiner flow is: connect → request snapshot → write the
 * sandbox to disk → load the project → open the scene → engine init
 * (seconds; occasionally retried) → `CollabSession.attachEngine`.
 * Scene Command ops are only consumed by the SessionController built
 * in `attachEngine`, so before this buffer existed every host paint /
 * place / undo delivered during that window was permanently lost on
 * the joiner. The CollabSession now pushes every inbound non-protocol,
 * non-project op here from construction and replays the buffer through
 * the freshly-built SessionController on attach — in arrival order,
 * which on the ordered-reliable op channel equals send order.
 *
 * Dedupe: the host's snapshot may already contain the effects of
 * buffered ops (host painted, THEN serviced the snapshot request — the
 * op still arrived on the wire). The snapshot therefore carries a
 * {@link SnapshotOpWatermark}: the host's next command-op `seq`, read
 * synchronously at capture START. Ops from the host with
 * `seq < nextSeq` were applied to the host's engine before capture
 * began, so their effects are guaranteed inside the snapshot —
 * {@link PreAttachOpBuffer.drain} skips them. Ops at-or-above the
 * watermark replay; a command executed DURING the async capture may
 * end up both in the snapshot and replayed, which is safe because
 * every built-in command's `apply` (and `revert`) is idempotent —
 * see the analysis on `CollabSession.attachEngine`.
 */

/** Default cap — see {@link PreAttachOpBuffer}. */
export const PRE_ATTACH_OP_BUFFER_CAP = 4096

/**
 * Watermark the snapshot host stamps onto the {@link ProjectSnapshot}
 * so a joiner can skip buffered ops whose effects the snapshot already
 * contains.
 */
export interface SnapshotOpWatermark {
  /** The snapshot host's stable peer id — only its ops are covered. */
  peerId: string
  /**
   * The host's next command-op sequence number, read synchronously at
   * snapshot-capture start. Every op from `peerId` with
   * `seq < nextSeq` was applied to the host's engine before the
   * capture read any state, so its effect is inside the snapshot.
   */
  nextSeq: number
}

/**
 * `true` when the op is covered by the watermark — i.e. it carries the
 * watermark peer's id and a seq strictly below `nextSeq`, meaning its
 * effect is already part of the snapshot the joiner loaded.
 */
export function isCoveredByWatermark(op: unknown, watermark: SnapshotOpWatermark): boolean {
  if (!op || typeof op !== 'object') return false
  const candidate = op as { peerId?: unknown; seq?: unknown }
  return (
    candidate.peerId === watermark.peerId &&
    typeof candidate.seq === 'number' &&
    Number.isInteger(candidate.seq) &&
    candidate.seq < watermark.nextSeq
  )
}

/**
 * Bounded FIFO of raw inbound ops. Pure data structure (no transport,
 * no engine) so the buffer/replay semantics are unit-testable on the
 * engine side.
 *
 * Capacity is defensive only — the pre-attach window is seconds, and
 * even a frantic host paints a few ops per second. Beyond the cap the
 * OLDEST op is dropped (with a one-time `console.warn`): the newest
 * ops are the ones most likely to still matter, and a window long
 * enough to overflow the cap means the joiner should re-snapshot
 * anyway.
 */
export class PreAttachOpBuffer {
  private ops: unknown[] = []
  private droppedCount = 0
  private warnedOverflow = false

  constructor(private readonly cap: number = PRE_ATTACH_OP_BUFFER_CAP) {}

  /** Number of ops currently buffered. */
  get size(): number {
    return this.ops.length
  }

  /** Number of ops dropped due to the cap since the last drain/clear. */
  get dropped(): number {
    return this.droppedCount
  }

  /** Append an op; beyond the cap the oldest buffered op is dropped. */
  push(op: unknown): void {
    if (this.ops.length >= this.cap) {
      this.ops.shift()
      this.droppedCount++
      if (!this.warnedOverflow) {
        this.warnedOverflow = true
        console.warn(
          `PreAttachOpBuffer: cap of ${this.cap} ops exceeded — dropping oldest. ` +
            'The joiner stayed in the pre-attach phase unusually long; its state may desync.',
        )
      }
    }
    this.ops.push(op)
  }

  /**
   * Return every buffered op in arrival order, skipping ops covered by
   * `watermark` (already contained in the loaded snapshot). Resets the
   * buffer — a second drain returns `[]`.
   */
  drain(watermark?: SnapshotOpWatermark | null): unknown[] {
    const out = watermark ? this.ops.filter((op) => !isCoveredByWatermark(op, watermark)) : this.ops
    this.ops = []
    this.droppedCount = 0
    this.warnedOverflow = false
    return out
  }

  /** Discard everything. Used on session close. */
  clear(): void {
    this.ops = []
    this.droppedCount = 0
    this.warnedOverflow = false
  }
}
