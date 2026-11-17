import { describe, expect, it } from '@gjsify/unit'

import type { CollabSession } from './collab-session.ts'
import { connectionIndicator } from './connection-indicator.ts'
import type { SessionState } from './session-state.ts'

const COLLAB = {} as CollabSession

export default async () => {
  await describe('connection indicator', async () => {
    await it('shows connecting while the joiner negotiates', async () => {
      expect(connectionIndicator({ kind: 'connecting' }, false)).toBe('connecting')
    })

    await it('shows reconnecting only on a live session with a link blip', async () => {
      const live: SessionState = { kind: 'connected', role: 'host', roomId: 'r', collab: COLLAB }
      expect(connectionIndicator(live, true)).toBe('reconnecting')
      expect(connectionIndicator(live, false)).toBe('none')
    })

    await it('stays hidden outside a session, whatever the stale link flag says', async () => {
      for (const kind of ['idle', 'browsing'] as const) {
        expect(connectionIndicator({ kind }, true)).toBe('none')
      }
      expect(connectionIndicator({ kind: 'hosting', roomId: 'r', port: 1 }, true)).toBe('none')
    })
  })
}
