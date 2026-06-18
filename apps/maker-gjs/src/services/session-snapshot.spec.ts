/**
 * Pure `SessionState` → `SessionSnapshot` projection behind the Control
 * plane's `GetSessionState`. The load-bearing property: the snapshot is a
 * scalar whitelist, so the live `CollabSession` carried on the
 * `awaiting-engine` / `connected` arms (`state.collab`) can NEVER reach the
 * JSON wire — a future SessionState field can't silently serialise a live
 * object over D-Bus.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { SessionState } from './session-service.ts'
import { toSessionSnapshot } from './session-snapshot.ts'

export default async () => {
  await describe('toSessionSnapshot', async () => {
    await it('maps null (no service yet) to idle', async () => {
      expect(toSessionSnapshot(null)).toStrictEqual({ kind: 'idle' })
    })

    await it('maps idle with no stray keys', async () => {
      expect(toSessionSnapshot({ kind: 'idle' })).toStrictEqual({ kind: 'idle' })
    })

    await it('maps browsing', async () => {
      expect(toSessionSnapshot({ kind: 'browsing' })).toStrictEqual({ kind: 'browsing' })
    })

    await it('maps connecting', async () => {
      expect(toSessionSnapshot({ kind: 'connecting' })).toStrictEqual({ kind: 'connecting' })
    })

    await it('maps hosting with roomId + port only', async () => {
      expect(toSessionSnapshot({ kind: 'hosting', roomId: 'r1', port: 5555 })).toStrictEqual({
        kind: 'hosting',
        roomId: 'r1',
        port: 5555,
      })
    })

    await it('maps awaiting-engine without leaking the live collab', async () => {
      const state = {
        kind: 'awaiting-engine',
        role: 'joiner',
        roomId: 'r2',
        sandboxProjectPath: '/tmp/sandbox/game-project.json',
        collab: { __live: 'collab-session' },
      } as unknown as SessionState
      const snap = toSessionSnapshot(state)
      expect(snap).toStrictEqual({
        kind: 'awaiting-engine',
        role: 'joiner',
        roomId: 'r2',
        sandboxProjectPath: '/tmp/sandbox/game-project.json',
      })
      expect('collab' in snap).toBe(false)
    })

    await it('maps connected with role + roomId only, no port, no collab leak', async () => {
      const state = { kind: 'connected', role: 'host', roomId: 'r3', collab: {} } as unknown as SessionState
      const snap = toSessionSnapshot(state)
      expect(snap).toStrictEqual({ kind: 'connected', role: 'host', roomId: 'r3' })
      expect('collab' in snap).toBe(false)
      expect('port' in snap).toBe(false)
    })
  })
}
