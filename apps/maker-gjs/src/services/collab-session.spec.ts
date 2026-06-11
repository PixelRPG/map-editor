/**
 * Tests for {@link CollabSession.start} — specifically the
 * "wait-for-connected" deadline introduced in this PR.
 *
 * Why a separate test file (and not a section of collab-session-
 * e2e.spec): this suite isolates the negotiation logic with fakes,
 * so a regression in the timeout-wait code path can be diagnosed
 * without spinning up real WebSockets. The e2e spec covers the
 * happy-path with real transports.
 *
 * Regression coverage for the 2026-05-30 hand-test bug: joiner
 * WebSocket opens, peer.connect() resolves (ICE gathering started),
 * BUT the data channels never reach `open` because the host never
 * answered. Pre-fix: CollabSession.start() resolved successfully
 * and requestSnapshot hung forever. Post-fix: start() rejects with
 * a CollabTimeoutError naming "reach connected state".
 */

import { describe, expect, it } from '@gjsify/unit'
import {
  CHANNEL_AWARENESS,
  CHANNEL_OP,
  type Command,
  createSnapshotResponseOp,
  type Engine,
  FakeRTCPeerConnection,
  InMemoryTransport,
  type Operation,
  PROJECT_SNAPSHOT_VERSION,
  type ProjectOp,
  type ProjectSnapshot,
  rtcFactoryFor,
  type SignallingMessage,
  type SignallingTransport,
  wireChannelDelivery,
} from '@pixelrpg/engine'
import { EventEmitter as ExEventEmitter } from 'excalibur'

import { CollabTimeoutError } from './collab-log.ts'
import { CollabSession } from './collab-session.ts'

/**
 * Bare-minimum signalling transport: send goes nowhere, no inbound
 * messages ever arrive. Used to model the "host never replies"
 * symptom from the 2026-05-30 hand-test.
 */
function silentTransport(): SignallingTransport & { sent: SignallingMessage[]; closed: boolean } {
  const sent: SignallingMessage[] = []
  let closed = false
  let handler: ((m: SignallingMessage) => void) | null = null
  return {
    send: (m) => {
      sent.push(m)
    },
    onMessage: (h) => {
      handler = h
    },
    close: () => {
      closed = true
    },
    get sent() {
      return sent
    },
    get closed() {
      return closed
    },
    // Expose handler for tests that want to inject inbound messages
    // — unused in this suite, but documents the shape.
    triggerInbound: (m: SignallingMessage) => handler?.(m),
  } as never
}

export default async () => {
  await describe('CollabSession.start (peer-connect deadline)', async () => {
    await it('REGRESSION (2026-05-30): joiner whose host never answers rejects with CollabTimeoutError', async () => {
      const transport = silentTransport()
      const pc = new FakeRTCPeerConnection()
      const session = new CollabSession({
        role: 'joiner',
        signalling: transport,
        peerId: 'joiner-test',
        peerConnectTimeoutMs: 100,
        rtcFactory: rtcFactoryFor(pc),
      })
      let caught: unknown = null
      const t0 = Date.now()
      try {
        await session.start()
      } catch (err) {
        caught = err
      }
      const elapsed = Date.now() - t0
      expect(caught instanceof CollabTimeoutError).toBe(true)
      const timeoutErr = caught as CollabTimeoutError
      expect(timeoutErr.timeoutMs).toBe(100)
      // The deadline fires on the wait-for-connected leg, not the
      // peer.connect() leg — for joiners peer.connect() resolves
      // instantly (no SDP to send), so the connected-wait is what
      // exceeded the budget.
      expect(timeoutErr.operation).toMatch(/CollabSession/)
      expect(elapsed).toBeGreaterThanOrEqual(95)
      expect(elapsed).toBeLessThan(1_500)
      session.close('test')
    })

    await it('host whose joiner never answers rejects with CollabTimeoutError', async () => {
      const transport = silentTransport()
      const pc = new FakeRTCPeerConnection()
      const session = new CollabSession({
        role: 'host',
        signalling: transport,
        peerId: 'host-test',
        peerConnectTimeoutMs: 100,
        rtcFactory: rtcFactoryFor(pc),
      })
      let caught: unknown = null
      try {
        await session.start()
      } catch (err) {
        caught = err
      }
      expect(caught instanceof CollabTimeoutError).toBe(true)
      // Host actually sends an SDP offer — verify it went out
      // before the timeout fired, so we know the host code path
      // started the negotiation properly.
      expect(transport.sent.some((m) => m.type === 'sdp')).toBe(true)
      session.close('test')
    })

    await it('resolves when both data channels open before the deadline', async () => {
      // Build a working pair via InMemoryTransport + open channels
      // synchronously after construction. CollabSession.start() should
      // race the connected-wait against the deadline and win.
      const hostTransport = new InMemoryTransport()
      const joinerTransport = new InMemoryTransport()
      hostTransport.other = joinerTransport
      joinerTransport.other = hostTransport

      const hostPc = new FakeRTCPeerConnection()
      const joinerPc = new FakeRTCPeerConnection()
      const hostSession = new CollabSession({
        role: 'host',
        signalling: hostTransport,
        peerId: 'host-ok',
        peerConnectTimeoutMs: 1_000,
        rtcFactory: rtcFactoryFor(hostPc),
      })
      const joinerSession = new CollabSession({
        role: 'joiner',
        signalling: joinerTransport,
        peerId: 'joiner-ok',
        peerConnectTimeoutMs: 1_000,
        rtcFactory: rtcFactoryFor(joinerPc),
      })

      const hostStarted = hostSession.start()
      const joinerStarted = joinerSession.start()
      // Drain microtasks so SDP exchange happens.
      await new Promise<void>((r) => setTimeout(r, 0))
      // Now open the data channels — host already created them in
      // its constructor; the joiner needs them simulated as inbound.
      const hostOpChannel = hostPc.channels.find((c) => c.label === CHANNEL_OP)!
      const hostAwarenessChannel = hostPc.channels.find((c) => c.label === CHANNEL_AWARENESS)!
      const joinerOpChannel = joinerPc.simulateIncomingChannel(CHANNEL_OP)
      const joinerAwarenessChannel = joinerPc.simulateIncomingChannel(CHANNEL_AWARENESS)
      wireChannelDelivery(hostOpChannel, joinerOpChannel)
      wireChannelDelivery(hostAwarenessChannel, joinerAwarenessChannel)
      hostOpChannel.open()
      hostAwarenessChannel.open()
      joinerOpChannel.open()
      joinerAwarenessChannel.open()

      await hostStarted
      await joinerStarted
      expect(hostSession.isConnected()).toBe(true)
      expect(joinerSession.isConnected()).toBe(true)
      hostSession.close('test')
      joinerSession.close('test')
    })

    await it('rejects when the peer transitions to "closed" before connected', async () => {
      const transport = silentTransport()
      const pc = new FakeRTCPeerConnection()
      const session = new CollabSession({
        role: 'joiner',
        signalling: transport,
        peerId: 'joiner-closed',
        peerConnectTimeoutMs: 5_000,
        rtcFactory: rtcFactoryFor(pc),
      })
      const started = session.start()
      // Microtask drain so peer.connect() runs and waitForConnected
      // subscribes.
      await new Promise<void>((r) => setTimeout(r, 0))
      // Force-close the peer before any channel opens.
      session.peer.close('mid-handshake')

      let caught: unknown = null
      try {
        await started
      } catch (err) {
        caught = err
      }
      expect(caught instanceof Error).toBe(true)
      const errMsg = (caught as Error).message
      // Either the connected-wait detects the closed transition OR
      // the underlying peer.connect() rejects — both paths produce
      // a non-empty message that doesn't reduce to "{}".
      expect(errMsg.length).toBeGreaterThan(0)
      expect(errMsg).not.toBe('{}')
    })
  })

  await describe('CollabSession pre-attach op buffer', async () => {
    /**
     * Minimal engine fake satisfying everything `attachEngine` wires:
     * SessionController (events + applyRemoteCommand/Revert),
     * RemoteCursorRenderer ('map-loaded' subscription) and the two
     * pointer/selection bridges.
     */
    function makeMockEngine() {
      const applied: Command[] = []
      const reverted: Command[] = []
      const engine = {
        events: new ExEventEmitter(),
        applyRemoteCommand: (command: Command) => {
          applied.push(command)
        },
        applyRemoteRevert: (command: Command) => {
          reverted.push(command)
        },
        onPointerMoved: () => () => {},
        onSelectionChanged: () => () => {},
      }
      return { engine: engine as unknown as Engine, applied, reverted }
    }

    function makeJoinerSession(): CollabSession {
      return new CollabSession({
        role: 'joiner',
        signalling: silentTransport(),
        peerId: 'joiner-buffer',
        peerConnectTimeoutMs: 100,
        rtcFactory: rtcFactoryFor(new FakeRTCPeerConnection()),
      })
    }

    function paintOp(seq: number, overrides: Partial<Operation> = {}): Operation {
      return {
        kind: 'tile.paint',
        payload: { layerId: 'ground', tileX: seq, tileY: 0, spriteId: 1, previousSprites: [] },
        peerId: 'host-peer',
        seq,
        ...overrides,
      }
    }

    await it('buffers pre-attach scene Command ops and replays them in arrival order on attachEngine', async () => {
      const session = makeJoinerSession()
      const projectOps: ProjectOp[] = []
      session.onProjectOpReceived = (op) => {
        projectOps.push(op)
      }

      // Delivered while NO engine is attached — pre-fix these were lost.
      session.peer.events.emit('op-received', { op: paintOp(0) })
      session.peer.events.emit('op-received', { op: paintOp(1) })
      session.peer.events.emit('op-received', { op: paintOp(2, { direction: 'revert' }) })
      // Own echo — must not be buffered.
      session.peer.events.emit('op-received', { op: paintOp(3, { peerId: 'joiner-buffer' }) })
      // Project op — handled by its own sink, must not be replayed.
      session.peer.events.emit('op-received', {
        op: { kind: '__project/entity.remove', payload: { id: 'x' }, peerId: 'host-peer', seq: 4 },
      })

      const { engine, applied, reverted } = makeMockEngine()
      session.attachEngine(engine)

      expect(applied).toHaveLength(2)
      expect(applied.map((c) => (c.payload as { tileX: number }).tileX)).toStrictEqual([0, 1])
      expect(reverted).toHaveLength(1)
      expect((reverted[0]?.payload as { tileX: number }).tileX).toBe(2)
      expect(projectOps).toHaveLength(1)

      // Live ops after attach flow straight through the controller.
      session.peer.events.emit('op-received', { op: paintOp(5) })
      expect(applied).toHaveLength(3)
      session.close('test')
    })

    await it('skips buffered ops the snapshot opWatermark marks as already contained', async () => {
      const session = makeJoinerSession()

      // Resolve a snapshot request carrying the host's watermark:
      // ops with seq < 2 were applied before capture began.
      const snapshot: ProjectSnapshot = {
        version: PROJECT_SNAPSHOT_VERSION,
        projectFilename: 'game-project.json',
        project: { id: 'p' } as ProjectSnapshot['project'],
        maps: [],
        spriteSets: [],
        opWatermark: { peerId: 'host-peer', nextSeq: 2 },
      }
      const pending = session.requestSnapshot(1_000)
      session.peer.events.emit('op-received', {
        op: createSnapshotResponseOp({ peerId: 'host-peer', seq: 0, snapshot }),
      })
      const received = await pending
      expect(received.opWatermark?.nextSeq).toBe(2)

      session.peer.events.emit('op-received', { op: paintOp(0) }) // in snapshot — skipped
      session.peer.events.emit('op-received', { op: paintOp(1) }) // in snapshot — skipped
      session.peer.events.emit('op-received', { op: paintOp(2) }) // replayed
      session.peer.events.emit('op-received', { op: paintOp(3) }) // replayed

      const { engine, applied } = makeMockEngine()
      session.attachEngine(engine)

      expect(applied.map((c) => (c.payload as { tileX: number }).tileX)).toStrictEqual([2, 3])
      session.close('test')
    })

    await it('close() discards the buffer without replaying', async () => {
      const session = makeJoinerSession()
      session.peer.events.emit('op-received', { op: paintOp(0) })
      session.close('test')
      const { engine, applied } = makeMockEngine()
      let threw = false
      try {
        session.attachEngine(engine)
      } catch {
        threw = true
      }
      expect(threw).toBe(true)
      expect(applied).toHaveLength(0)
    })
  })
}
