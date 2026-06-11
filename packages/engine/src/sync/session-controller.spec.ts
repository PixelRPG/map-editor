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

    await it('ignores inbound project ops (__project/*) without hitting the registry or engine', async () => {
      const engine = makeMockEngine()
      const session = makeMockSession()
      // Throw if any warn fires — a project op must be skipped cleanly,
      // NOT treated as an unknown command kind (which warns).
      const originalWarn = console.warn
      let warned = false
      console.warn = () => {
        warned = true
      }
      try {
        new SessionController({
          engine: engine as unknown as Engine,
          session: session as unknown as PeerSession,
          peerId: 'alice',
          registry: FAKE_REGISTRY,
        })
        session.events.emit('op-received', {
          op: { kind: '__project/character.upsert', payload: { character: { id: 'x' } }, peerId: 'bob', seq: 0 },
        })
      } finally {
        console.warn = originalWarn
      }
      expect(engine.applied).toHaveLength(0)
      expect(engine.reverted).toHaveLength(0)
      expect(warned).toBe(false)
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

    await it('peekNextSeq() exposes the next outgoing seq without consuming it', async () => {
      const engine = makeMockEngine()
      const session = makeMockSession()
      const ctrl = new SessionController({
        engine: engine as unknown as Engine,
        session: session as unknown as PeerSession,
        peerId: 'alice',
        registry: FAKE_REGISTRY,
      })

      expect(ctrl.peekNextSeq()).toBe(0)
      expect(ctrl.peekNextSeq()).toBe(0) // peek does not increment
      engine.events.emit('command-executed', { command: new FakeCommand({ value: 1 }) })
      engine.events.emit('command-reverted', { command: new FakeCommand({ value: 2 }) })
      expect(ctrl.peekNextSeq()).toBe(2)
      // Watermark contract: every op already sent has seq < peekNextSeq().
      expect(session.sent.every((op) => (op as Operation).seq < ctrl.peekNextSeq())).toBe(true)
    })

    await it('applyRemoteOperation() replays a raw op through the same inbound pipeline', async () => {
      const engine = makeMockEngine()
      const session = makeMockSession()
      const ctrl = new SessionController({
        engine: engine as unknown as Engine,
        session: session as unknown as PeerSession,
        peerId: 'alice',
        registry: FAKE_REGISTRY,
      })

      ctrl.applyRemoteOperation({ kind: 'test.fake', payload: { value: 21 }, peerId: 'bob', seq: 0 })
      ctrl.applyRemoteOperation({
        kind: 'test.fake',
        payload: { value: 22 },
        peerId: 'bob',
        seq: 1,
        direction: 'revert',
      })
      // Echo + project ops are filtered exactly like live inbound ops.
      ctrl.applyRemoteOperation({ kind: 'test.fake', payload: { value: 23 }, peerId: 'alice', seq: 9 })
      ctrl.applyRemoteOperation({ kind: '__project/entity.upsert', payload: {}, peerId: 'bob', seq: 2 })

      expect(engine.applied).toHaveLength(1)
      expect((engine.applied[0]?.payload as { value: number }).value).toBe(21)
      expect(engine.reverted).toHaveLength(1)
      expect((engine.reverted[0]?.payload as { value: number }).value).toBe(22)
    })

    await it('applyRemoteOperation() is a no-op after close()', async () => {
      const engine = makeMockEngine()
      const session = makeMockSession()
      const ctrl = new SessionController({
        engine: engine as unknown as Engine,
        session: session as unknown as PeerSession,
        peerId: 'alice',
        registry: FAKE_REGISTRY,
      })
      ctrl.close()
      ctrl.applyRemoteOperation({ kind: 'test.fake', payload: { value: 5 }, peerId: 'bob', seq: 0 })
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
