import { formatErrorMessage } from '../utils/format-error.ts'

/**
 * ONE chunking + reassembly implementation for every large wire
 * payload. A single WebRTC SCTP send larger than 64 KiB is silently
 * dropped by GStreamer's webrtcbin (RFC 8841 default `max-message-size`
 * — the 2026-06-01 hand-test bug where a 1.27 MB snapshot never
 * arrived), so anything potentially big is sliced into envelopes of
 * {@link CHUNK_SIZE_BYTES} and reassembled by index on the far side.
 *
 * Consumers: the snapshot-on-join path (`snapshot-exchange.ts`, fixed
 * transfer id — one transfer at a time per pending request) and the
 * `__project/spriteset.*.chunk` ops (`project-operations.ts`, keyed by
 * `transferId` so several transfers may interleave). Both previously
 * had their own copy with DIVERGING validation; the hardened contract
 * (envelope validation, mid-stream `totalChunks` change = protocol
 * violation, duplicate-index tolerance, parse diagnostics) now lives
 * here once.
 */

/** SCTP-safe chunk size: ~80 sends for a 1.2 MB snapshot. */
export const CHUNK_SIZE_BYTES = 16 * 1024

/** One slice of a chunked JSON payload, addressed by transfer + index. */
export interface ChunkEnvelope {
  /** Groups the slices of one logical payload (multi-transfer reassembly). */
  transferId: string
  chunkIndex: number
  totalChunks: number
  data: string
}

/**
 * Slice `json` into ordered {@link ChunkEnvelope}s. Always yields at
 * least one envelope (even when the payload fits in a single chunk) so
 * receivers have exactly one code path.
 */
export function buildChunkEnvelopes(
  transferId: string,
  json: string,
  chunkSize: number = CHUNK_SIZE_BYTES,
): ChunkEnvelope[] {
  const totalChunks = Math.max(1, Math.ceil(json.length / chunkSize))
  const envelopes: ChunkEnvelope[] = []
  for (let i = 0; i < totalChunks; i++) {
    envelopes.push({
      transferId,
      chunkIndex: i,
      totalChunks,
      data: json.slice(i * chunkSize, (i + 1) * chunkSize),
    })
  }
  return envelopes
}

/** Outcome of feeding one envelope into a {@link ChunkReassembler}. */
export type ChunkAccept<T> =
  | { status: 'pending' }
  | { status: 'done'; payload: T }
  | { status: 'error'; reason: string }

/**
 * Accumulates {@link ChunkEnvelope}s per `transferId` until a transfer
 * completes, then JSON-parses the joined payload. Validation contract
 * (previously only the snapshot path had it):
 *
 * - malformed envelope (non-integer / out-of-range index or total) →
 *   `error`, the transfer's partial state is dropped;
 * - `totalChunks` changing mid-stream → `error` (protocol violation);
 * - duplicate index → ignored (`pending`) — an ordered+reliable
 *   channel shouldn't produce these, but be defensive;
 * - JSON parse failure on completion → `error` with diagnostics.
 *
 * Callers decide what an `error` means for them (fail the pending
 * request vs. warn and drop the transfer).
 */
export class ChunkReassembler<T> {
  private readonly transfers = new Map<string, { chunks: Array<string | undefined>; total: number; received: number }>()

  /** Feed one envelope; see the class doc for the outcome contract. */
  accept(envelope: ChunkEnvelope): ChunkAccept<T> {
    const { transferId, chunkIndex, totalChunks, data } = envelope
    if (
      !Number.isInteger(totalChunks) ||
      totalChunks <= 0 ||
      !Number.isInteger(chunkIndex) ||
      chunkIndex < 0 ||
      chunkIndex >= totalChunks
    ) {
      this.transfers.delete(transferId)
      return {
        status: 'error',
        reason: `invalid chunk envelope (chunkIndex=${chunkIndex}, totalChunks=${totalChunks})`,
      }
    }
    let entry = this.transfers.get(transferId)
    if (!entry) {
      entry = { chunks: new Array<string | undefined>(totalChunks), total: totalChunks, received: 0 }
      this.transfers.set(transferId, entry)
    } else if (entry.total !== totalChunks) {
      this.transfers.delete(transferId)
      return {
        status: 'error',
        reason: `chunk batch size changed mid-stream (saw totalChunks=${entry.total}, then ${totalChunks})`,
      }
    }
    if (entry.chunks[chunkIndex] !== undefined) return { status: 'pending' }
    entry.chunks[chunkIndex] = data
    entry.received++
    if (entry.received < entry.total) return { status: 'pending' }

    this.transfers.delete(transferId)
    const json = entry.chunks.join('')
    try {
      return { status: 'done', payload: JSON.parse(json) as T }
    } catch (err) {
      return {
        status: 'error',
        reason: `failed to parse reassembled payload (json.length=${json.length}): ${formatErrorMessage(err)}`,
      }
    }
  }

  /** Drop any partially-received transfers (e.g. on session close). */
  clear(): void {
    this.transfers.clear()
  }
}
