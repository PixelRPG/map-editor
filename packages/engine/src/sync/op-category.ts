/**
 * The CATEGORY half of an op's identity on the reliable channel.
 *
 * Three unrelated message families share one ordered-reliable data
 * channel: scene `Command` ops, `__project/*` project ops, and
 * `__session/*` protocol frames. Each family is sequenced by its own
 * counter — `SessionController`'s command counter and `CollabSession`'s
 * project-op counter both start at 0 — and every one of them stamps the
 * SAME `peerId`. So `(peerId, seq)` is NOT unique on that channel:
 * `{peer: 'host', seq: 3}` names one command op AND one project op.
 *
 * Anything that dedupes or watermarks on `(peerId, seq)` therefore has
 * to carry the category too, or it will confuse a project op for a
 * command op. Until now that only worked because `CollabSession` routes
 * `__project/*` away before the pre-attach buffer sees it — an
 * invariant nothing enforced. It works solo and desyncs a joiner.
 *
 * The category is derived from `kind`, which every family already
 * prefixes distinctly, so no wire-format change is needed: the
 * discriminator was always on the envelope, it just was not consulted.
 */

import { isProjectOp } from './project-operations.ts'
import { isSessionProtocolOp } from './session-protocol.ts'

/** Which message family an op on the reliable channel belongs to. */
export type OpCategory = 'command' | 'project' | 'session-protocol'

/**
 * Classify a raw inbound/outbound op. Anything that is not prefixed as
 * a project op or a session-protocol frame is a scene `Command` op —
 * including malformed values, which the command replay path rejects on
 * its own terms (see `PreAttachOpBuffer`'s tolerance for shapes without
 * a usable `seq`).
 */
export function classifyOp(op: unknown): OpCategory {
  if (isSessionProtocolOp(op)) return 'session-protocol'
  if (isProjectOp(op)) return 'project'
  return 'command'
}

/**
 * Thrown when an op of the wrong category reaches a command-only
 * structure. Loud on purpose: the alternative is a silent drop, and a
 * silently-dropped op on a joiner is precisely the desync this
 * category exists to prevent.
 */
export class OpCategoryError extends Error {
  constructor(
    readonly expected: OpCategory,
    readonly actual: OpCategory,
    readonly kind: unknown,
  ) {
    super(
      `Expected a ${expected}-category op but got a ${actual} one (kind: ${String(kind)}). ` +
        'These share one channel and one peerId/seq keyspace, so mixing them silently corrupts dedupe.',
    )
    this.name = 'OpCategoryError'
  }
}

/**
 * Assert `op` is a scene `Command` op, throwing {@link OpCategoryError}
 * otherwise. Used at the boundary of structures whose `(peerId, seq)`
 * keying is only meaningful within the command category.
 */
export function assertCommandOp(op: unknown): void {
  const category = classifyOp(op)
  if (category === 'command') return
  throw new OpCategoryError('command', category, (op as { kind?: unknown } | null)?.kind)
}
