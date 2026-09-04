/** Provenance stamped onto every outbound project-level op. */
export interface OutboundOpContext {
  peerId: string
  seq: number
}

/**
 * Sequencer for everything this peer sends on the project-op channel.
 *
 * ONE counter spans plain project ops and both chunked sprite-set
 * transfers on purpose: `(peerId, seq)` is the transport identity a
 * receiver dedupes on, so two sends sharing a seq would make one of
 * them invisible to the peer — a desync that never shows up solo,
 * because a solo peer has nobody to dedupe against.
 *
 * Transfer ids are namespaced by the sending peer for the same reason:
 * a reassembler keyed on a bare counter would collide across peers.
 */
export class OutboundOpStamper {
  private seq = 0
  private transferCounter = 0

  constructor(private readonly peerId: string) {}

  /** Provenance for the next outbound op; advances the sequence. */
  next(): OutboundOpContext {
    return { peerId: this.peerId, seq: this.seq++ }
  }

  /** Stamp an already-built op (e.g. a chunk envelope) with the next provenance. */
  stamp<T extends object>(op: T): T & OutboundOpContext {
    return { ...op, ...this.next() }
  }

  /** Fresh transfer id for a chunked send — `<peerId>:<tag><n>`. */
  nextTransferId(tag: string): string {
    return `${this.peerId}:${tag}${this.transferCounter++}`
  }
}
