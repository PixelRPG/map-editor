import { describe, expect, it } from '@gjsify/unit'
import {
  ENTITY_REMOVE_KIND,
  ENTITY_UPSERT_KIND,
  type EntityDefinition,
  PLAYER_SET_KIND,
  PROJECT_META_UPDATE_KIND,
  type ProjectOp,
  SPRITESET_REMOVE_KIND,
  type SpriteSetAddPayload,
  type SpriteSetData,
  type SpriteSetUpdatePayload,
} from '@pixelrpg/engine'

import {
  bindProjectSinks,
  broadcastEntityRemove,
  broadcastEntityUpsert,
  broadcastPlayerSet,
  broadcastProjectMeta,
  broadcastSpriteSetAdd,
  broadcastSpriteSetRemove,
  broadcastSpriteSetUpdate,
  type ProjectSyncSession,
} from './project-store-broadcast.ts'

const npc: EntityDefinition = { id: 'npc-1', name: 'NPC', components: [] }
const descriptor = { id: 'tiles', name: 'Tiles' } as unknown as SpriteSetData

/** Recording session fake — captures everything that reaches the wire. */
function makeSession() {
  const ops: ProjectOp[] = []
  const adds: SpriteSetAddPayload[] = []
  const updates: SpriteSetUpdatePayload[] = []
  const session: ProjectSyncSession & {
    ops: ProjectOp[]
    adds: SpriteSetAddPayload[]
    updates: SpriteSetUpdatePayload[]
  } = {
    ops,
    adds,
    updates,
    sendProjectOp: (build) => ops.push(build({ peerId: 'local-peer', seq: ops.length })),
    sendSpriteSetAdd: (payload) => adds.push(payload),
    sendSpriteSetUpdate: (payload) => updates.push(payload),
    onProjectOpReceived: null,
    onSpriteSetAddReceived: null,
    onSpriteSetUpdateReceived: null,
  }
  return session
}

export default async () => {
  await describe('project-op broadcast', async () => {
    await it('stamps each mutation with its wire kind and the local peer envelope', async () => {
      const session = makeSession()
      broadcastEntityUpsert(session, npc)
      broadcastEntityRemove(session, 'npc-1')
      broadcastPlayerSet(session, null)
      broadcastProjectMeta(session, 'Renamed', { author: 'someone' })
      broadcastSpriteSetRemove(session, 'tiles')

      expect(session.ops.map((op) => op.kind)).toStrictEqual([
        ENTITY_UPSERT_KIND,
        ENTITY_REMOVE_KIND,
        PLAYER_SET_KIND,
        PROJECT_META_UPDATE_KIND,
        SPRITESET_REMOVE_KIND,
      ])
      expect(session.ops.map((op) => op.seq)).toStrictEqual([0, 1, 2, 3, 4])
      expect(session.ops.every((op) => op.peerId === 'local-peer')).toBe(true)
    })

    await it('carries the payload each op kind is defined to carry', async () => {
      const session = makeSession()
      broadcastEntityUpsert(session, npc)
      broadcastPlayerSet(session, 'npc-1')
      broadcastProjectMeta(session, 'Renamed', { author: 'someone' })

      const [upsert, player, meta] = session.ops
      if (upsert.kind === ENTITY_UPSERT_KIND) expect(upsert.payload.entity.id).toBe('npc-1')
      if (player.kind === PLAYER_SET_KIND) expect(player.payload.playerActorId).toBe('npc-1')
      if (meta.kind === PROJECT_META_UPDATE_KIND) {
        expect(meta.payload.name).toBe('Renamed')
        expect(meta.payload.properties.author).toBe('someone')
      }
    })

    await it('sends sprite sets on their own channels — add carries bytes, update does not', async () => {
      const session = makeSession()
      broadcastSpriteSetAdd(session, descriptor, 'AAAA')
      broadcastSpriteSetUpdate(session, descriptor)

      expect(session.ops).toHaveLength(0)
      expect(session.adds[0].imageBase64).toBe('AAAA')
      expect(session.adds[0].data.id).toBe('tiles')
      expect(session.updates[0].data.id).toBe('tiles')
    })

    await it('is a silent no-op in solo editing (no session)', async () => {
      broadcastEntityUpsert(null, npc)
      broadcastEntityRemove(null, 'npc-1')
      broadcastPlayerSet(null, null)
      broadcastProjectMeta(null, 'Renamed', {})
      broadcastSpriteSetRemove(null, 'tiles')
      broadcastSpriteSetAdd(null, descriptor, 'AAAA')
      broadcastSpriteSetUpdate(null, descriptor)
    })
  })

  await describe('bindProjectSinks', async () => {
    await it('routes all three inbound channels at the applier', async () => {
      const session = makeSession()
      const seen: string[] = []
      bindProjectSinks(session, {
        projectOp: () => seen.push('op'),
        spriteSetAdd: () => seen.push('add'),
        spriteSetUpdate: () => seen.push('update'),
      })

      session.onProjectOpReceived?.({} as ProjectOp)
      session.onSpriteSetAddReceived?.({} as SpriteSetAddPayload)
      session.onSpriteSetUpdateReceived?.({} as SpriteSetUpdatePayload)
      expect(seen).toStrictEqual(['op', 'add', 'update'])
    })

    await it('clears all three so the session buffers again', async () => {
      const session = makeSession()
      bindProjectSinks(session, {
        projectOp: () => {},
        spriteSetAdd: () => {},
        spriteSetUpdate: () => {},
      })
      bindProjectSinks(session, null)

      expect(session.onProjectOpReceived).toBeNull()
      expect(session.onSpriteSetAddReceived).toBeNull()
      expect(session.onSpriteSetUpdateReceived).toBeNull()
    })
  })
}
