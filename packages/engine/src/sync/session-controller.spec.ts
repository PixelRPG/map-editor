import { describe, expect, it } from '@gjsify/unit'
import { EventEmitter as ExEventEmitter } from 'excalibur'

import type { Command, CommandRegistry, Operation } from '../commands/types.ts'
import type { Engine } from '../engine.ts'
import type { PeerSession } from './peer-session.ts'
import { SessionController } from './session-controller.ts'
import type { PeerSessionEventMap } from './types.ts'

interface MockEngine {
  events: ExEventEmitter<{
    'command-executed': { command: Command }
    'command-reverted': { command: Command }
  }>
  applyRemoteCommand: (command: Command) => void
  applyRemoteRevert: (command: Command) => void
  applied: Command[]
  reverted: Command[]
}

interface MockSession {
  events: ExEventEmitter<PeerSessionEventMap>
  sendOp: (op: unknown) => void
  sent: unknown[]
}

function makeMockEngine(): MockEngine {
  const applied: Command[] = []
  const reverted: Command[] = []
  return {
    events: new ExEventEmitter(),
    applyRemoteCommand(command) {
      applied.push(command)
    },
    applyRemoteRevert(command) {
      reverted.push(command)
    },
    applied,
    reverted,
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

async function muteWarn<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = console.warn
  console.warn = () => {}
  try {
    return await fn()
  } finally {
    console.warn = original
  }
}

export default async () => {
  await describe('SessionController', async () => {
    await it('serialises local commands into Operations and sends via session', async () => {
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
      const op = session.sent[0] as Operation
      expect(op.kind).toBe('test.fake')
      expect((op.payload as { value: number }).value).toBe(7)
      expect(op.peerId).toBe('alice')
      expect(op.seq).toBe(0)
      expect(op.direction).toBe('apply')
    })

    await it("relays a local 'command-reverted' as an Operation with direction='revert'", async () => {
      const engine = makeMockEngine()
      const session = makeMockSession()
      new SessionController({
        engine: engine as unknown as Engine,
        session: session as unknown as PeerSession,
        peerId: 'alice',
        registry: FAKE_REGISTRY,
      })

      engine.events.emit('command-reverted', { command: new FakeCommand({ value: 9 }) })

      expect(session.sent).toHaveLength(1)
      const op = session.sent[0] as Operation
      expect(op.kind).toBe('test.fake')
      expect(op.direction).toBe('revert')
      expect((op.payload as { value: number }).value).toBe(9)
    })

    await it("routes inbound op with direction='revert' to applyRemoteRevert (not applyRemoteCommand)", async () => {
      const engine = makeMockEngine()
      const session = makeMockSession()
      new SessionController({
        engine: engine as unknown as Engine,
        session: session as unknown as PeerSession,
        peerId: 'alice',
        registry: FAKE_REGISTRY,
      })

      session.events.emit('op-received', {
        op: { kind: 'test.fake', payload: { value: 11 }, peerId: 'bob', seq: 0, direction: 'revert' },
      })

      expect(engine.applied).toHaveLength(0)
      expect(engine.reverted).toHaveLength(1)
      expect((engine.reverted[0]?.payload as { value: number }).value).toBe(11)
    })

    await it("defaults to 'apply' when inbound op omits direction (backward compat)", async () => {
      const engine = makeMockEngine()
      const session = makeMockSession()
      new SessionController({
        engine: engine as unknown as Engine,
        session: session as unknown as PeerSession,
        peerId: 'alice',
        registry: FAKE_REGISTRY,
      })

      session.events.emit('op-received', {
        op: { kind: 'test.fake', payload: { value: 13 }, peerId: 'bob', seq: 0 },
      })

      expect(engine.applied).toHaveLength(1)
      expect(engine.reverted).toHaveLength(0)
    })

    await it('stamps a monotonically increasing seq per emit', async () => {
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

      expect(session.sent.map((op) => (op as Operation).seq)).toStrictEqual([0, 1, 2])
    })

    await it('applies inbound ops to the engine after registry lookup', async () => {
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

    await it('drops inbound ops whose kind is not in the registry', async () => {
      const engine = makeMockEngine()
      const session = makeMockSession()
      new SessionController({
        engine: engine as unknown as Engine,
        session: session as unknown as PeerSession,
        peerId: 'alice',
        registry: FAKE_REGISTRY,
      })

      await muteWarn(async () => {
        session.events.emit('op-received', { op: { kind: 'unknown.thing', payload: {}, peerId: 'bob', seq: 0 } })
      })
      expect(engine.applied).toHaveLength(0)
    })

    await it('drops inbound ops whose peerId equals our own (echo defence)', async () => {
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

    await it('drops inbound ops with missing / malformed shape', async () => {
      const engine = makeMockEngine()
      const session = makeMockSession()
      new SessionController({
        engine: engine as unknown as Engine,
        session: session as unknown as PeerSession,
        peerId: 'alice',
        registry: FAKE_REGISTRY,
      })

      await muteWarn(async () => {
        session.events.emit('op-received', { op: null })
        session.events.emit('op-received', { op: { payload: { value: 1 } } as unknown })
      })
      expect(engine.applied).toHaveLength(0)
    })

    await it('close() stops both directions; further emits are ignored', async () => {
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
      engine.events.emit('command-reverted', { command: new FakeCommand({ value: 2 }) })
      session.events.emit('op-received', { op: { kind: 'test.fake', payload: { value: 3 }, peerId: 'bob', seq: 0 } })
      session.events.emit('op-received', {
        op: { kind: 'test.fake', payload: { value: 4 }, peerId: 'bob', seq: 1, direction: 'revert' },
      })

      expect(session.sent).toHaveLength(0)
      expect(engine.applied).toHaveLength(0)
      expect(engine.reverted).toHaveLength(0)
    })
  })
}
