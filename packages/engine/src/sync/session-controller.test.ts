import { EventEmitter as ExEventEmitter } from 'excalibur'
import { describe, expect, it, vi } from 'vitest'

import type { Command, CommandRegistry, Operation } from '../commands/types.ts'
import type { Engine } from '../engine.ts'
import type { PeerSession } from './peer-session.ts'
import type { PeerSessionEventMap } from './types.ts'
import { SessionController } from './session-controller.ts'

/**
 * Unit tests for {@link SessionController} — exercise the engine ↔
 * session glue with mocked Engine + PeerSession. The mocks expose
 * only the surface the controller touches: `engine.events.on(
 * COMMAND_EXECUTED)`, `engine.applyRemoteCommand`, `session.events
 * .on('op-received')`, `session.sendOp`. Real Engine + PeerSession
 * are not booted here — the engine smoke test owns those.
 */

interface MockEngine {
  events: ExEventEmitter<{ 'command-executed': { command: Command } }>
  applyRemoteCommand: (command: Command) => void
  applied: Command[]
}

interface MockSession {
  events: ExEventEmitter<PeerSessionEventMap>
  sendOp: (op: unknown) => void
  sent: unknown[]
}

function makeMockEngine(): MockEngine {
  const applied: Command[] = []
  return {
    events: new ExEventEmitter(),
    applyRemoteCommand(command) {
      applied.push(command)
    },
    applied,
  }
}

function makeMockSession(): MockSession {
  const sent: unknown[] = []
  return {
    events: new ExEventEmitter(),
    sendOp(op) {
      sent.push(op)
    },
    sent,
  }
}

class FakeCommand implements Command {
  static readonly KIND = 'test.fake'
  readonly kind = FakeCommand.KIND
  readonly label = 'fake'
  constructor(readonly payload: { value: number }) {}
  apply(): void {
    /* no-op */
  }
  revert(): void {
    /* no-op */
  }
}

const FAKE_REGISTRY: CommandRegistry = {
  [FakeCommand.KIND]: (payload) => new FakeCommand(payload as { value: number }),
}

describe('SessionController', () => {
  it('serialises local commands into Operations and sends via session', () => {
    const engine = makeMockEngine()
    const session = makeMockSession()
    new SessionController({
      engine: engine as unknown as Engine,
      session: session as unknown as PeerSession,
      peerId: 'alice',
      registry: FAKE_REGISTRY,
    })

    engine.events.emit('command-executed', { command: new FakeCommand({ value: 7 }) })

    expect(session.sent).toHaveLength(1)
    expect(session.sent[0]).toMatchObject({
      kind: 'test.fake',
      payload: { value: 7 },
      peerId: 'alice',
      seq: 0,
    })
  })

  it('stamps a monotonically increasing seq per emit', () => {
    const engine = makeMockEngine()
    const session = makeMockSession()
    new SessionController({
      engine: engine as unknown as Engine,
      session: session as unknown as PeerSession,
      peerId: 'alice',
      registry: FAKE_REGISTRY,
    })

    engine.events.emit('command-executed', { command: new FakeCommand({ value: 1 }) })
    engine.events.emit('command-executed', { command: new FakeCommand({ value: 2 }) })
    engine.events.emit('command-executed', { command: new FakeCommand({ value: 3 }) })

    expect(session.sent.map((op) => (op as Operation).seq)).toEqual([0, 1, 2])
  })

  it('applies inbound ops to the engine after registry lookup', () => {
    const engine = makeMockEngine()
    const session = makeMockSession()
    new SessionController({
      engine: engine as unknown as Engine,
      session: session as unknown as PeerSession,
      peerId: 'alice',
      registry: FAKE_REGISTRY,
    })

    session.events.emit('op-received', {
      op: { kind: 'test.fake', payload: { value: 42 }, peerId: 'bob', seq: 0 },
    })

    expect(engine.applied).toHaveLength(1)
    expect(engine.applied[0]).toBeInstanceOf(FakeCommand)
    expect((engine.applied[0]?.payload as { value: number }).value).toBe(42)
  })

  it('drops inbound ops whose kind is not in the registry', () => {
    const engine = makeMockEngine()
    const session = makeMockSession()
    new SessionController({
      engine: engine as unknown as Engine,
      session: session as unknown as PeerSession,
      peerId: 'alice',
      registry: FAKE_REGISTRY,
    })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    session.events.emit('op-received', { op: { kind: 'unknown.thing', payload: {}, peerId: 'bob', seq: 0 } })
    expect(engine.applied).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('drops inbound ops whose peerId equals our own (echo defence)', () => {
    const engine = makeMockEngine()
    const session = makeMockSession()
    new SessionController({
      engine: engine as unknown as Engine,
      session: session as unknown as PeerSession,
      peerId: 'alice',
      registry: FAKE_REGISTRY,
    })

    session.events.emit('op-received', {
      op: { kind: 'test.fake', payload: { value: 1 }, peerId: 'alice', seq: 99 },
    })

    expect(engine.applied).toHaveLength(0)
  })

  it('drops inbound ops with missing / malformed shape', () => {
    const engine = makeMockEngine()
    const session = makeMockSession()
    new SessionController({
      engine: engine as unknown as Engine,
      session: session as unknown as PeerSession,
      peerId: 'alice',
      registry: FAKE_REGISTRY,
    })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    session.events.emit('op-received', { op: null })
    session.events.emit('op-received', { op: { payload: { value: 1 } } as unknown }) // no kind
    expect(engine.applied).toHaveLength(0)
    warn.mockRestore()
  })

  it('close() stops both directions; further emits are ignored', () => {
    const engine = makeMockEngine()
    const session = makeMockSession()
    const ctrl = new SessionController({
      engine: engine as unknown as Engine,
      session: session as unknown as PeerSession,
      peerId: 'alice',
      registry: FAKE_REGISTRY,
    })

    ctrl.close()
    ctrl.close() // idempotent

    engine.events.emit('command-executed', { command: new FakeCommand({ value: 1 }) })
    session.events.emit('op-received', { op: { kind: 'test.fake', payload: { value: 2 }, peerId: 'bob', seq: 0 } })

    expect(session.sent).toHaveLength(0)
    expect(engine.applied).toHaveLength(0)
  })
})
