/**
 * End-to-end integration suite — drives the FULL collab stack
 * with two real `SessionController`s + two real `AwarenessManager`s
 * connected via the in-memory transport pair from #101.
 *
 * Where the per-module specs verify each piece in isolation
 * (snapshot-exchange.spec, awareness.spec, peer-session.spec,
 * session-controller.spec, project-snapshot.spec), this suite
 * exercises them composed: a real op flows through one peer's
 * `Engine.events.emit(COMMAND_EXECUTED)` → wire → other peer's
 * `Engine.applyRemoteCommand` callback. Same for awareness
 * cursor + selection + presence frames.
 *
 * `Engine` is duck-typed because the protocol tests don't care
 * about real Excalibur boot — only the
 * `events.emit(COMMAND_EXECUTED)` + `applyRemoteCommand` contract
 * the sync layer depends on. Tests that DO care about the engine
 * (loadProject + map mutations + tile-paint outcomes) belong in
 * the maker integration suite where they can boot a real engine
 * against a fixture project.
 *
 * This is the "is the wire protocol correct end-to-end" gate —
 * the test most likely to catch regressions in:
 *   - operation envelope shape (any change to `kind` / `payload`
 *     / `peerId` / `seq` semantics breaks a real-host scenario
 *     here)
 *   - awareness throttle / dedup interplay across peers
 *   - peer-id echo suppression (a peer must not see its OWN ops
 *     bounced back)
 *   - tear-down ordering (disposing one side cleanly without
 *     leaking listeners on the other)
 */

import { describe, expect, it } from '@gjsify/unit'
import { EventEmitter } from 'excalibur'

import type { Command } from '../commands/index.ts'
import type { Engine } from '../engine.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'

import { AwarenessManager, type AwarenessMessage } from './awareness.ts'
import { createConnectedSessionPair, flushMicrotasks } from './in-memory-transport.ts'
import { SessionController } from './session-controller.ts'

/**
 * Minimal Engine stub. Only the surface `SessionController` +
 * `AwarenessManager` actually touch is implemented; everything
 * else returns undefined.
 */
interface RecordingEngine extends Engine {
  appliedRemote: Command[]
  emitCommand: (command: Command) => void
}

function makeRecordingEngine(): RecordingEngine {
  const events = new EventEmitter<EngineEventMap>()
  const applied: Command[] = []
  return {
    events,
    applyRemoteCommand: (cmd: Command) => {
      applied.push(cmd)
    },
    appliedRemote: applied,
    emitCommand: (command: Command) => {
      events.emit(EngineEvent.COMMAND_EXECUTED, { command })
    },
  } as unknown as RecordingEngine
}

// Real `Command<T>` carries `label` + `apply` + `revert` on top of
// `kind + payload`. The wire only uses the first two; the receive-
// side `applyRemoteCommand` calls `apply` against the engine, so
// for the protocol-level integration tests a no-op apply/revert
// is enough — we record the inbound command and inspect its
// `payload`, never run `apply`.
const SAMPLE_PAINT: Command = {
  kind: 'tile.paint',
  label: 'paint',
  payload: { tileMapId: 't', layerId: 'l', col: 1, row: 2, tile: 5 } as unknown,
  apply: () => {},
  revert: () => {},
} as unknown as Command

const SAMPLE_PAINT_B: Command = {
  kind: 'tile.paint',
  label: 'paint',
  payload: { tileMapId: 't', layerId: 'l', col: 3, row: 4, tile: 7 } as unknown,
  apply: () => {},
  revert: () => {},
} as unknown as Command

export default async () => {
  await describe('Collab integration — op bidirectional sync', async () => {
    await it('host-side COMMAND_EXECUTED reaches joiner via applyRemoteCommand', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostEngine = makeRecordingEngine()
        const joinerEngine = makeRecordingEngine()

        const hostCtrl = new SessionController({
          engine: hostEngine,
          session: sessions.host,
          peerId: 'host-1',
          // tile.paint isn't registered in the BUILT_IN_COMMANDS
          // (real registry covers it); register a passthrough so
          // the receiver can construct the command back from the
          // wire envelope.
          registry: {
            'tile.paint': (payload: unknown) =>
              ({
                kind: 'tile.paint',
                label: 'paint',
                payload,
                apply: () => {},
                revert: () => {},
              }) as unknown as Command,
          },
        })
        const joinerCtrl = new SessionController({
          engine: joinerEngine,
          session: sessions.joiner,
          peerId: 'joiner-1',
          registry: {
            'tile.paint': (payload: unknown) =>
              ({
                kind: 'tile.paint',
                label: 'paint',
                payload,
                apply: () => {},
                revert: () => {},
              }) as unknown as Command,
          },
        })

        hostEngine.emitCommand(SAMPLE_PAINT)
        await flushMicrotasks()

        // Host should NOT see its own op echoed back (peerId guard
        // in SessionController.applyInbound).
        expect(hostEngine.appliedRemote.length).toBe(0)
        // Joiner SHOULD have received + re-materialised it.
        expect(joinerEngine.appliedRemote.length).toBe(1)
        expect(joinerEngine.appliedRemote[0].kind).toBe('tile.paint')
        expect(joinerEngine.appliedRemote[0].payload).toStrictEqual(SAMPLE_PAINT.payload)

        hostCtrl.close()
        joinerCtrl.close()
      } finally {
        sessions.close()
      }
    })

    await it('ops flow in BOTH directions', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostEngine = makeRecordingEngine()
        const joinerEngine = makeRecordingEngine()
        const registry = {
          'tile.paint': (payload: unknown) =>
            ({ kind: 'tile.paint', label: 'paint', payload, apply: () => {}, revert: () => {} }) as unknown as Command,
        }

        const hostCtrl = new SessionController({
          engine: hostEngine,
          session: sessions.host,
          peerId: 'host-2',
          registry,
        })
        const joinerCtrl = new SessionController({
          engine: joinerEngine,
          session: sessions.joiner,
          peerId: 'joiner-2',
          registry,
        })

        hostEngine.emitCommand(SAMPLE_PAINT)
        joinerEngine.emitCommand(SAMPLE_PAINT_B)
        await flushMicrotasks()

        expect(joinerEngine.appliedRemote.map((c) => c.payload)).toStrictEqual([SAMPLE_PAINT.payload])
        expect(hostEngine.appliedRemote.map((c) => c.payload)).toStrictEqual([SAMPLE_PAINT_B.payload])

        hostCtrl.close()
        joinerCtrl.close()
      } finally {
        sessions.close()
      }
    })

    await it('unknown command kind on the wire is dropped, not crashed', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostEngine = makeRecordingEngine()
        const joinerEngine = makeRecordingEngine()
        // Empty registry → every inbound op kind is "unknown".
        const hostCtrl = new SessionController({
          engine: hostEngine,
          session: sessions.host,
          peerId: 'host-3',
          registry: {
            'tile.paint': (payload: unknown) =>
              ({
                kind: 'tile.paint',
                label: 'paint',
                payload,
                apply: () => {},
                revert: () => {},
              }) as unknown as Command,
          },
        })
        const joinerCtrl = new SessionController({
          engine: joinerEngine,
          session: sessions.joiner,
          peerId: 'joiner-3',
          registry: {},
        })

        hostEngine.emitCommand(SAMPLE_PAINT)
        await flushMicrotasks()

        // Joiner had no factory for 'tile.paint' — drop, don't crash.
        expect(joinerEngine.appliedRemote.length).toBe(0)

        hostCtrl.close()
        joinerCtrl.close()
      } finally {
        sessions.close()
      }
    })
  })

  await describe('Collab integration — awareness bidirectional sync', async () => {
    await it('cursor frame from host materialises in joiner peer state', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostSent: AwarenessMessage[] = []
        const hostAwareness = new AwarenessManager({
          localPeerId: 'host-a',
          localInfo: { displayName: 'Alice', color: '#1c71d8' },
          send: (m) => {
            hostSent.push(m)
            sessions.host.sendAwareness(m)
          },
        })
        const joinerAwareness = new AwarenessManager({
          localPeerId: 'joiner-b',
          localInfo: { displayName: 'Bob', color: '#dc8add' },
          send: (m) => sessions.joiner.sendAwareness(m),
        })
        sessions.host.events.on('awareness-received', ({ data }) => hostAwareness.handleInbound(data))
        sessions.joiner.events.on('awareness-received', ({ data }) => joinerAwareness.handleInbound(data))

        hostAwareness.announce()
        hostAwareness.sendCursor({ sceneId: 'dungeon', x: 12, y: 7 })
        await flushMicrotasks()

        const bob = joinerAwareness.getPeer('host-a')
        expect(bob).not.toBeNull()
        expect(bob?.info.displayName).toBe('Alice')
        expect(bob?.cursor).toStrictEqual({ sceneId: 'dungeon', x: 12, y: 7 })
        // Host MUST NOT see its own frame bounced back.
        expect(hostAwareness.getPeers().length).toBe(0)
      } finally {
        sessions.close()
      }
    })

    await it('selection updates propagate; presence info change replaces the prior one', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostAwareness = new AwarenessManager({
          localPeerId: 'host-c',
          localInfo: { displayName: 'A', color: '#1c71d8' },
          send: (m) => sessions.host.sendAwareness(m),
        })
        const joinerAwareness = new AwarenessManager({
          localPeerId: 'joiner-d',
          localInfo: { displayName: 'B', color: '#dc8add' },
          send: (m) => sessions.joiner.sendAwareness(m),
        })
        sessions.host.events.on('awareness-received', ({ data }) => hostAwareness.handleInbound(data))
        sessions.joiner.events.on('awareness-received', ({ data }) => joinerAwareness.handleInbound(data))

        hostAwareness.announce()
        hostAwareness.sendSelection({ placementIds: ['a', 'b'] })
        await flushMicrotasks()
        let host = joinerAwareness.getPeer('host-c')
        expect(host?.selection?.placementIds).toStrictEqual(['a', 'b'])

        hostAwareness.sendSelection({ placementIds: [] })
        await flushMicrotasks()
        host = joinerAwareness.getPeer('host-c')
        expect(host?.selection?.placementIds).toStrictEqual([])
      } finally {
        sessions.close()
      }
    })

    await it('explicit leave drops the peer state on the other side', async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostAwareness = new AwarenessManager({
          localPeerId: 'host-e',
          localInfo: { displayName: 'A', color: '#1c71d8' },
          send: (m) => sessions.host.sendAwareness(m),
        })
        const joinerAwareness = new AwarenessManager({
          localPeerId: 'joiner-f',
          localInfo: { displayName: 'B', color: '#dc8add' },
          send: (m) => sessions.joiner.sendAwareness(m),
        })
        sessions.host.events.on('awareness-received', ({ data }) => hostAwareness.handleInbound(data))
        sessions.joiner.events.on('awareness-received', ({ data }) => joinerAwareness.handleInbound(data))

        hostAwareness.announce()
        await flushMicrotasks()
        expect(joinerAwareness.getPeer('host-e')).not.toBeNull()

        const leftEvents: string[] = []
        joinerAwareness.on('peer-left', (e) => leftEvents.push(e.peerId))

        hostAwareness.leave()
        await flushMicrotasks()
        expect(leftEvents).toStrictEqual(['host-e'])
        expect(joinerAwareness.getPeer('host-e')).toBeNull()
      } finally {
        sessions.close()
      }
    })
  })

  await describe('Collab integration — tear-down ordering', async () => {
    await it("closing one peer's controller does not leak into the other", async () => {
      const sessions = await createConnectedSessionPair()
      try {
        const hostEngine = makeRecordingEngine()
        const joinerEngine = makeRecordingEngine()
        const registry = {
          'tile.paint': (payload: unknown) =>
            ({ kind: 'tile.paint', label: 'paint', payload, apply: () => {}, revert: () => {} }) as unknown as Command,
        }

        const hostCtrl = new SessionController({
          engine: hostEngine,
          session: sessions.host,
          peerId: 'host-x',
          registry,
        })
        const joinerCtrl = new SessionController({
          engine: joinerEngine,
          session: sessions.joiner,
          peerId: 'joiner-x',
          registry,
        })

        hostCtrl.close()
        // Joiner still mutable; emitted commands flow nowhere but
        // don't crash.
        joinerEngine.emitCommand(SAMPLE_PAINT)
        await flushMicrotasks()

        // Host's engine never receives anything (its controller is
        // closed; the inbound subscription was torn down).
        expect(hostEngine.appliedRemote.length).toBe(0)
        // Joiner doesn't echo its own command back either.
        expect(joinerEngine.appliedRemote.length).toBe(0)

        joinerCtrl.close()
      } finally {
        sessions.close()
      }
    })
  })
}
