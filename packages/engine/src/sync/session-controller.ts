import { BUILT_IN_COMMANDS } from '../commands/registry.ts'
import type { Command, CommandRegistry, Operation } from '../commands/types.ts'
import type { Engine } from '../engine.ts'
import { EngineEvent } from '../types/index.ts'

import type { PeerSession } from './peer-session.ts'

export interface SessionControllerOptions {
  engine: Engine
  session: PeerSession
  /** This peer's stable id — stamped onto every emitted `Operation`. */
  peerId: string
  /** Override the built-in command registry (e.g. to register custom commands). */
  registry?: CommandRegistry
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
  private localSeq = 0
  private commandSub: { close(): void } | null = null
  private sessionSub: { close(): void } | null = null
  private closed = false

  constructor(opts: SessionControllerOptions) {
    this.engine = opts.engine
    this.session = opts.session
    this.peerId = opts.peerId
    this.registry = opts.registry ?? BUILT_IN_COMMANDS

    // Local → wire
    this.commandSub = this.engine.events.on(EngineEvent.COMMAND_EXECUTED, ({ command }) => {
      if (this.closed) return
      this.session.sendOp(this.toOperation(command))
    })

    // Wire → local
    this.sessionSub = this.session.events.on('op-received', ({ op }) => {
      if (this.closed) return
      this.applyInbound(op)
    })
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
    this.sessionSub?.close()
    this.sessionSub = null
  }

  private toOperation(command: Command): Operation {
    return {
      kind: command.kind,
      payload: command.payload,
      peerId: this.peerId,
      seq: this.localSeq++,
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
    const factory = this.registry[op.kind]
    if (!factory) {
      console.warn(`SessionController: unknown command kind: ${op.kind}`)
      return
    }
    const command = factory(op.payload)
    this.engine.applyRemoteCommand(command)
  }
}
