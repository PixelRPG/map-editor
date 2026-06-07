import { BUILT_IN_COMMANDS } from '../commands/registry.ts'
import type { Command, CommandRegistry, Operation } from '../commands/types.ts'
import type { Engine } from '../engine.ts'
import { EngineEvent } from '../types/index.ts'

import type { PeerSession } from './peer-session.ts'
import { isProjectOp } from './project-operations.ts'
import { isSessionProtocolOp, type SessionProtocolOp } from './session-protocol.ts'

interface SessionControllerOptions {
  engine: Engine
  session: PeerSession
  /** This peer's stable id — stamped onto every emitted `Operation`. */
  peerId: string
  /** Override the built-in command registry (e.g. to register custom commands). */
  registry?: CommandRegistry
  /**
   * Hook for session-protocol messages (`__session/*` kinds — see
   * {@link SessionProtocolOp}). The CollabSession layer uses this
   * to react to snapshot requests / responses without polluting
   * the command path with non-mutation traffic.
   *
   * Optional — when undefined, session-protocol messages are
   * silently dropped (matches the behaviour of an unknown command
   * kind, but without the noisy warn).
   */
  onSessionProtocol?: (op: SessionProtocolOp) => void
}

/**
 * Glue between the local {@link Engine} and a {@link PeerSession}.
 *
 *   - Local mutations: `Engine.events(COMMAND_EXECUTED)` →
 *     serialise as `Operation` → `session.sendOp`.
 *
 *   - Remote mutations: `session.events('op-received')` →
 *     resolve the concrete `Command` via the registry →
 *     `engine.applyRemoteCommand(command)`.
 *
 * One controller owns one peer session. Hosting multiple peers
 * (Phase 4+) would expand this to fan-out + per-peer ordering,
 * but v1's Pair-Editing is point-to-point so the simpler shape
 * lands first.
 *
 * Sequence numbers are monotone per-peer — the future host-
 * sequencer (concept doc § "The host-sequencer flow") will
 * rewrite `seq` on receipt, but the receiver does not depend on
 * it for v1's apply-on-arrival semantics.
 */
export class SessionController {
  private readonly engine: Engine
  private readonly session: PeerSession
  private readonly peerId: string
  private readonly registry: CommandRegistry
  private readonly onSessionProtocol: ((op: SessionProtocolOp) => void) | null
  private localSeq = 0
  private commandSub: { close(): void } | null = null
  private revertSub: { close(): void } | null = null
  private sessionSub: { close(): void } | null = null
  private closed = false

  constructor(opts: SessionControllerOptions) {
    this.engine = opts.engine
    this.session = opts.session
    this.peerId = opts.peerId
    this.registry = opts.registry ?? BUILT_IN_COMMANDS
    this.onSessionProtocol = opts.onSessionProtocol ?? null

    // Local → wire (apply path: initial execute + redo)
    this.commandSub = this.engine.events.on(EngineEvent.COMMAND_EXECUTED, ({ command }) => {
      if (this.closed) return
      this.session.sendOp(this.toOperation(command, 'apply'))
    })

    // Local → wire (revert path: undo). Relayed with
    // `Operation.direction = 'revert'` so the receiving peer
    // runs `command.revert` instead of `apply`. Without this hook
    // a peer's undo of their own paint would never reach peers.
    this.revertSub = this.engine.events.on(EngineEvent.COMMAND_REVERTED, ({ command }) => {
      if (this.closed) return
      this.session.sendOp(this.toOperation(command, 'revert'))
    })

    // Wire → local
    this.sessionSub = this.session.events.on('op-received', ({ op }) => {
      if (this.closed) return
      this.applyInbound(op)
    })
  }

  /**
   * Send a session-protocol message (e.g. snapshot-request /
   * snapshot-response). Stamps `peerId` + `seq` so the receiver
   * can deduplicate the same way it does for commands; the
   * envelope rides the existing reliable op channel.
   */
  sendSessionProtocol(op: Omit<SessionProtocolOp, 'peerId' | 'seq'>): void {
    if (this.closed) return
    const stamped = {
      ...op,
      peerId: this.peerId,
      seq: this.localSeq++,
    } as SessionProtocolOp
    this.session.sendOp(stamped)
  }

  /**
   * Detach from both engine + session. Idempotent. The peer
   * session itself is NOT closed — the controller can be replaced
   * mid-session (e.g. host migration in Phase 8) without
   * disrupting the data channel.
   */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.commandSub?.close()
    this.commandSub = null
    this.revertSub?.close()
    this.revertSub = null
    this.sessionSub?.close()
    this.sessionSub = null
  }

  private toOperation(command: Command, direction: 'apply' | 'revert'): Operation {
    return {
      kind: command.kind,
      payload: command.payload,
      peerId: this.peerId,
      seq: this.localSeq++,
      direction,
    }
  }

  private applyInbound(rawOp: unknown): void {
    const op = rawOp as Partial<Operation> | null
    if (!op || typeof op.kind !== 'string') {
      // Malformed wire frame — log + drop. A real protocol violation
      // should be rare; PeerSession already validated the JSON shape
      // on receive.
      console.warn('SessionController: dropped inbound op with missing kind')
      return
    }
    if (op.peerId === this.peerId) {
      // Defence against a malformed peer echoing our own ops back.
      return
    }
    // Session-protocol messages (snapshot-request / -response, etc.)
    // ride the same op channel for transport convenience but are
    // NOT commands — route them around the command registry.
    if (isSessionProtocolOp(rawOp)) {
      this.onSessionProtocol?.(rawOp)
      return
    }
    // Project-level ops (`__project/*` — cast mutations) ride the same
    // channel but mutate the GameProjectResource, not a scene. The
    // engine-independent CollabSession layer applies them; skip here so
    // they don't hit the command registry (which would warn).
    if (isProjectOp(rawOp)) {
      return
    }
    const factory = this.registry[op.kind]
    if (!factory) {
      console.warn(`SessionController: unknown command kind: ${op.kind}`)
      return
    }
    const command = factory(op.payload)
    // `direction` defaults to 'apply' for backward compat with
    // older peers that didn't ship the field. A 'revert' direction
    // routes to the symmetric `applyRemoteRevert` so peer-A's undo
    // of their own paint reverts on every connected peer (the
    // bug this field was introduced to close).
    if (op.direction === 'revert') {
      this.engine.applyRemoteRevert(command)
    } else {
      this.engine.applyRemoteCommand(command)
    }
  }
}
