import { describe, expect, it } from '@gjsify/unit'

import type { CollabSession } from './collab-session.ts'
import { blocksHosting, blocksJoin, hasLiveCollab, preSessionState, type SessionState } from './session-state.ts'

const FAKE_COLLAB = {} as CollabSession

const CONNECTED: SessionState = { kind: 'connected', role: 'host', roomId: 'r', collab: FAKE_COLLAB }
const AWAITING: SessionState = {
  kind: 'awaiting-engine',
  role: 'joiner',
  roomId: 'r',
  collab: FAKE_COLLAB,
  sandboxProjectPath: '/tmp/p/game-project.json',
}

export default async () => {
  await describe('session state guards', async () => {
    await it('blocks a join only while a session is being established or running', async () => {
      expect((['connecting', 'awaiting-engine', 'connected'] as const).every(blocksJoin)).toBe(true)
      expect((['idle', 'browsing', 'hosting'] as const).some(blocksJoin)).toBe(false)
    })

    await it('blocks hosting while any session is live — one session per maker', async () => {
      expect((['connected', 'connecting', 'hosting'] as const).every(blocksHosting)).toBe(true)
      expect((['idle', 'browsing', 'awaiting-engine'] as const).some(blocksHosting)).toBe(false)
    })

    await it('identifies exactly the two arms carrying a live collab session', async () => {
      expect(hasLiveCollab(CONNECTED)).toBe(true)
      expect(hasLiveCollab(AWAITING)).toBe(true)
      expect(hasLiveCollab({ kind: 'hosting', roomId: 'r', port: 1 })).toBe(false)
      expect(hasLiveCollab({ kind: 'connecting' })).toBe(false)
      expect(hasLiveCollab({ kind: 'idle' })).toBe(false)
      expect(hasLiveCollab({ kind: 'browsing' })).toBe(false)
    })

    await it('returns to browsing after a session only when the welcome view was browsing', async () => {
      expect(preSessionState(true)).toStrictEqual({ kind: 'browsing' })
      expect(preSessionState(false)).toStrictEqual({ kind: 'idle' })
    })
  })
}
