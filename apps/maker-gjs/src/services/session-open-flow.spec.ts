import { describe, expect, it } from '@gjsify/unit'
import type { Engine, ProjectSnapshot, SignallingTransport } from '@pixelrpg/engine'

import type { ScopedLogger } from './collab-log.ts'
import {
  type HostCollab,
  type JoinerCollab,
  pullSnapshotToSandbox,
  requireHostEngine,
  startOrTearDown,
} from './session-open-flow.ts'

function recordingLogger(lines: string[]): ScopedLogger {
  return {
    info: (m) => lines.push(`info:${m}`),
    warn: (m) => lines.push(`warn:${m}`),
    error: (m) => lines.push(`error:${m}`),
  }
}

function fakeTransport(): SignallingTransport & { closed: boolean } {
  return {
    closed: false,
    send() {},
    onMessage() {},
    close() {
      this.closed = true
    },
  } as SignallingTransport & { closed: boolean }
}

const SNAPSHOT = {
  project: { name: 'Shared' },
  maps: [{ path: 'maps/a.json' }, { path: 'maps/b.json' }],
} as unknown as ProjectSnapshot

export default async () => {
  await describe('requireHostEngine', async () => {
    await it('returns the engine when one is loaded', async () => {
      const engine = {} as Engine
      const transport = fakeTransport()
      expect(requireHostEngine(engine, transport)).toBe(engine)
      expect(transport.closed).toBe(false)
    })

    await it('throws a message naming the cause and closes the transport', async () => {
      // Pre-fix this surfaced as GJS's stack-only "Unhandled promise
      // rejection"; the welcome-view toast needs a readable message.
      const transport = fakeTransport()
      let message = ''
      try {
        requireHostEngine(null, transport)
      } catch (err) {
        message = (err as Error).message
      }
      expect(message.toLowerCase()).toContain('engine')
      expect(transport.closed).toBe(true)
    })
  })

  await describe('startOrTearDown', async () => {
    await it('leaves the session open on success', async () => {
      const closes: string[] = []
      const collab: HostCollab = { start: async () => {}, close: (r) => closes.push(r) }
      await startOrTearDown(collab, 'host-start-failed')
      expect(closes).toStrictEqual([])
    })

    await it('closes the session before rethrowing so no orphan peer is left answering', async () => {
      const closes: string[] = []
      const collab: HostCollab = {
        start: async () => {
          throw new Error('peer-connect timed out')
        },
        close: (r) => closes.push(r),
      }
      let message = ''
      try {
        await startOrTearDown(collab, 'host-start-failed')
      } catch (err) {
        message = (err as Error).message
      }
      expect(message).toBe('peer-connect timed out')
      expect(closes).toStrictEqual(['host-start-failed'])
    })

    await it('still rethrows the original error when the teardown itself throws', async () => {
      const collab: HostCollab = {
        start: async () => {
          throw new Error('original')
        },
        close: () => {
          throw new Error('teardown blew up')
        },
      }
      let message = ''
      try {
        await startOrTearDown(collab, 'host-start-failed')
      } catch (err) {
        message = (err as Error).message
      }
      expect(message).toBe('original')
    })
  })

  await describe('pullSnapshotToSandbox', async () => {
    await it('runs connect → snapshot → sandbox in order and returns the sandbox path', async () => {
      const order: string[] = []
      const collab: JoinerCollab = {
        start: async () => {
          order.push('start')
        },
        requestSnapshot: async (timeoutMs) => {
          order.push(`snapshot:${timeoutMs}`)
          return SNAPSHOT
        },
      }
      const lines: string[] = []
      const path = await pullSnapshotToSandbox(collab, 'room-1', {
        log: recordingLogger(lines),
        snapshotTimeoutMs: 250,
        writeSandbox: async (snapshot, roomId) => {
          order.push(`write:${roomId}:${snapshot.maps.length}`)
          return `/sandbox/${roomId}/game-project.json`
        },
      })

      expect(path).toBe('/sandbox/room-1/game-project.json')
      expect(order).toStrictEqual(['start', 'snapshot:250', 'write:room-1:2'])
    })

    await it('logs before every blocking leg so a field hang names the leg', async () => {
      const collab: JoinerCollab = { start: async () => {}, requestSnapshot: async () => SNAPSHOT }
      const lines: string[] = []
      await pullSnapshotToSandbox(collab, 'room-1', {
        log: recordingLogger(lines),
        writeSandbox: async () => '/sandbox/room-1/game-project.json',
      })
      expect(lines).toHaveLength(4)
      expect(lines[0]).toContain('awaiting peer-connect')
      expect(lines[1]).toContain('requesting snapshot (timeout=default)')
      expect(lines[2]).toContain('project="Shared"')
      expect(lines[2]).toContain('maps=2')
      expect(lines[3]).toContain('/sandbox/room-1/game-project.json')
    })

    await it('does not reach the sandbox write when the handshake fails', async () => {
      let wrote = false
      const collab: JoinerCollab = {
        start: async () => {
          throw new Error('peer-connect timed out')
        },
        requestSnapshot: async () => SNAPSHOT,
      }
      let message = ''
      try {
        await pullSnapshotToSandbox(collab, 'room-1', {
          log: recordingLogger([]),
          writeSandbox: async () => {
            wrote = true
            return 'x'
          },
        })
      } catch (err) {
        message = (err as Error).message
      }
      expect(message).toBe('peer-connect timed out')
      expect(wrote).toBe(false)
    })
  })
}
