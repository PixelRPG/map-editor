import type { Scene } from 'excalibur'

/**
 * Editor mutation primitive. Every state change the editor performs
 * (paint a tile, place an object, move a placement, edit a library
 * entry, …) is expressed as a `Command` and dispatched through
 * `Engine.executeCommand`. The command captures enough information
 * in its `payload` to:
 *
 * 1. **Apply** the mutation locally.
 * 2. **Revert** the mutation locally (for Undo).
 * 3. **Serialise** as an `Operation` (for future collab + Replay).
 *
 * See `docs/concepts/editor-architecture.md` § Migration / Phase 5
 * and `docs/concepts/collaboration-and-multiplayer.md` for the
 * three-fold use.
 *
 * Stable-IDs rule: every payload references stable identifiers
 * (`LayerData.id`, `ObjectPlacement.id`, tile coords, …) — **never**
 * Excalibur runtime entity ids. The command must survive scene
 * reload, save/load, and (later) cross-peer broadcast.
 */
export interface Command<P = unknown> {
  /**
   * Discriminator + serialisation key. Used by the
   * {@link CommandRegistry} to re-construct the right concrete
   * command class from a deserialised `Operation`.
   */
  readonly kind: string

  /** User-facing description shown in the Undo/Redo menus / status bar. */
  readonly label: string

  /**
   * Payload — pure data, fully serialisable. Carries enough state
   * for both `apply` and `revert`, including any captured
   * "previous value" needed to undo.
   */
  readonly payload: P

  /** Mutate the scene to match the post-state described by `payload`. */
  apply(scene: Scene): void

  /** Reverse the mutation — restore the pre-state. */
  revert(scene: Scene): void
}

/**
 * Wire-format envelope around a command. Carries the discriminator
 * + payload + the host-assigned sequence number used by the future
 * collab op-log. For local-only solo editing, `peerId === 'self'`
 * and `seq` is locally monotonic.
 *
 * `direction` is the apply/revert discriminator used by the
 * undo/redo replication path:
 *   - `'apply'` (default when missing) — receiver runs `command.apply`.
 *     Emitted by initial command execution + redo.
 *   - `'revert'` — receiver runs `command.revert`. Emitted by undo.
 *
 * Older peers (pre-direction-field) sent operations without the
 * field; receivers default to `'apply'` so existing wire traffic
 * continues to work unchanged.
 *
 * `origin` is attribution-only: the actor that INITIATED the
 * mutation when it differs from the sending peer's human user —
 * today that's the in-process AI collaborator
 * (`ASSISTANT_PEER_ID`) driving the host's engine via Control/MCP.
 * It deliberately does NOT replace `peerId`: sequence counters,
 * echo suppression and the snapshot `opWatermark` all key on
 * `(peerId, seq)` — the transport/session identity — and an op the
 * AI initiates is still sent (and deduped) as the hosting peer's
 * op. Absent = initiated by `peerId`'s own user (also what older
 * peers without the field send).
 */
export interface Operation<K extends string = string, P = unknown> {
  readonly kind: K
  readonly payload: P
  // `(peerId, seq)` is the op-log's dedupe/echo-suppression + snapshot
  // watermark key — `readonly` so a relay/forward path can't rewrite the
  // identity of an already-stamped op (mirrors Command's readonly payload).
  readonly peerId: string
  readonly seq: number
  /**
   * Correlation id of the local op this envelope echoes — set by the
   * originating peer so its own broadcast is recognised and suppressed
   * when it loops back through the transport. Absent on ops minted purely
   * for remote application.
   */
  localId?: string
  direction?: 'apply' | 'revert'
  origin?: string
}

/**
 * Factory map keyed by `Command.kind`. The Engine wires up a default
 * registry containing the built-in commands; consumers can register
 * project-specific commands later (e.g. custom scripted mutations).
 */
export type CommandFactory<P> = (payload: P) => Command<P>
export type CommandRegistry = Record<string, CommandFactory<unknown>>
