import type { ProjectOp, SessionProtocolOp, SpriteSetAddChunkOp, SpriteSetUpdateChunkOp } from '@pixelrpg/engine'
import {
  isProjectOp,
  isSessionProtocolOp,
  SPRITESET_ADD_CHUNK_KIND,
  SPRITESET_UPDATE_CHUNK_KIND,
} from '@pixelrpg/engine'

/**
 * Where one inbound op belongs. Four destinations exist on the reliable
 * op channel and they are NOT interchangeable:
 *
 *   - session-protocol frames drive the snapshot exchange,
 *   - `__project/*` ops mutate project-level data (no engine needed),
 *   - the two chunked sprite-set kinds need reassembly first,
 *   - everything else is a scene `Command` op for the SessionController.
 */
export type InboundOpRoute =
  | { kind: 'session-protocol'; op: SessionProtocolOp }
  | { kind: 'sprite-set-add'; op: SpriteSetAddChunkOp }
  | { kind: 'sprite-set-update'; op: SpriteSetUpdateChunkOp }
  | { kind: 'project'; op: ProjectOp }
  | { kind: 'command' }
  | { kind: 'own-echo' }

/**
 * Classify an inbound op for {@link CollabSession}'s `op-received` hook.
 *
 * Pure so the echo filter — the one guard that decides whether a second
 * peer converges or double-applies — can be exercised without a WebRTC
 * stack. Point-to-point transports shouldn't loop our own ops back, but
 * both project and command paths drop them defensively (mirroring
 * `SessionController`'s guard), so an op whose `peerId` is ours routes
 * to `own-echo` and is discarded.
 */
export function routeInboundOp(op: unknown, localPeerId: string): InboundOpRoute {
  if (isSessionProtocolOp(op)) return { kind: 'session-protocol', op }
  if (isProjectOp(op)) {
    if (op.peerId === localPeerId) return { kind: 'own-echo' }
    if (op.kind === SPRITESET_ADD_CHUNK_KIND) return { kind: 'sprite-set-add', op: op as SpriteSetAddChunkOp }
    if (op.kind === SPRITESET_UPDATE_CHUNK_KIND) return { kind: 'sprite-set-update', op: op as SpriteSetUpdateChunkOp }
    return { kind: 'project', op }
  }
  if ((op as { peerId?: unknown }).peerId === localPeerId) return { kind: 'own-echo' }
  return { kind: 'command' }
}
