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
 */
export interface Operation<K extends string = string, P = unknown> {
  kind: K
  payload: P
  peerId: string
  seq: number
  localId?: string
  direction?: 'apply' | 'revert'
}

/**
 * Factory map keyed by `Command.kind`. The Engine wires up a default
 * registry containing the built-in commands; consumers can register
 * project-specific commands later (e.g. custom scripted mutations).
 */
export type CommandFactory<P> = (payload: P) => Command<P>
export type CommandRegistry = Record<string, CommandFactory<unknown>>
