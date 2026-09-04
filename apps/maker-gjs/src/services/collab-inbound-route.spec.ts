import { describe, expect, it } from '@gjsify/unit'
import { createSnapshotRequestOp, SPRITESET_ADD_CHUNK_KIND, SPRITESET_UPDATE_CHUNK_KIND } from '@pixelrpg/engine'

import { routeInboundOp } from './collab-inbound-route.ts'

const LOCAL = 'peer-local'
const REMOTE = 'peer-remote'

export default async () => {
  await describe('routeInboundOp', async () => {
    await it('routes session-protocol frames to the snapshot exchange', async () => {
      const op = createSnapshotRequestOp({ peerId: REMOTE, seq: 0, roomId: 'r' })
      expect(routeInboundOp(op, LOCAL).kind).toBe('session-protocol')
    })

    await it('routes a session-protocol frame we sent ourselves — the exchange needs both directions', async () => {
      // Own-echo filtering must NOT reach the protocol channel: the
      // request/response pair is addressed, not broadcast.
      const op = createSnapshotRequestOp({ peerId: LOCAL, seq: 0, roomId: 'r' })
      expect(routeInboundOp(op, LOCAL).kind).toBe('session-protocol')
    })

    await it('routes plain project ops to the project sink', async () => {
      const route = routeInboundOp(
        { kind: '__project/entity.remove', payload: { entityId: 'x' }, peerId: REMOTE, seq: 1 },
        LOCAL,
      )
      expect(route.kind).toBe('project')
    })

    await it('routes the two chunked sprite-set kinds to their reassemblers', async () => {
      const add = routeInboundOp({ kind: SPRITESET_ADD_CHUNK_KIND, payload: {}, peerId: REMOTE, seq: 2 }, LOCAL)
      const update = routeInboundOp({ kind: SPRITESET_UPDATE_CHUNK_KIND, payload: {}, peerId: REMOTE, seq: 3 }, LOCAL)
      expect(add.kind).toBe('sprite-set-add')
      expect(update.kind).toBe('sprite-set-update')
    })

    await it('routes scene Command ops to the controller path', async () => {
      const route = routeInboundOp({ kind: 'tile.paint', payload: {}, peerId: REMOTE, seq: 4 }, LOCAL)
      expect(route.kind).toBe('command')
    })

    await it('drops our own echoes on both the project and the command path', async () => {
      // The desync this guards: without it a peer re-applies its own
      // mutation on arrival. Solo there is no echo at all, so the bug
      // is invisible until a second participant is present.
      expect(routeInboundOp({ kind: 'tile.paint', payload: {}, peerId: LOCAL, seq: 5 }, LOCAL).kind).toBe('own-echo')
      expect(
        routeInboundOp({ kind: '__project/entity.remove', payload: { entityId: 'x' }, peerId: LOCAL, seq: 6 }, LOCAL)
          .kind,
      ).toBe('own-echo')
      expect(routeInboundOp({ kind: SPRITESET_ADD_CHUNK_KIND, payload: {}, peerId: LOCAL, seq: 7 }, LOCAL).kind).toBe(
        'own-echo',
      )
    })

    await it('treats an op without a peerId as remote', async () => {
      expect(routeInboundOp({ kind: 'tile.paint', payload: {}, seq: 8 }, LOCAL).kind).toBe('command')
    })
  })
}
