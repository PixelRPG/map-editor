import { describe, expect, it } from '@gjsify/unit'

import { PROJECT_SNAPSHOT_VERSION, type ProjectSnapshot } from './project-snapshot.ts'
import {
  createSnapshotRequestOp,
  createSnapshotResponseOp,
  isSessionProtocolOp,
  SESSION_PROTOCOL_PREFIX,
  SNAPSHOT_REQUEST_KIND,
  SNAPSHOT_RESPONSE_KIND,
} from './session-protocol.ts'

const FAKE_SNAPSHOT: ProjectSnapshot = {
  version: PROJECT_SNAPSHOT_VERSION,
  projectFilename: 'game-project.json',
  project: { id: 'p', name: 'P', version: '1', spriteSets: [], maps: [], startup: { initialMapId: 'm' } } as unknown as ProjectSnapshot['project'],
  maps: [],
  spriteSets: [],
}

export default async () => {
  await describe('SESSION_PROTOCOL_PREFIX + kinds', async () => {
    await it('exposes the prefix and both kind constants under it', async () => {
      expect(SESSION_PROTOCOL_PREFIX).toBe('__session/')
      expect(SNAPSHOT_REQUEST_KIND.startsWith(SESSION_PROTOCOL_PREFIX)).toBe(true)
      expect(SNAPSHOT_RESPONSE_KIND.startsWith(SESSION_PROTOCOL_PREFIX)).toBe(true)
      // Distinct from command kinds (which use `.` separators).
      expect(SNAPSHOT_REQUEST_KIND.includes('.')).toBe(false)
    })
  })

  await describe('isSessionProtocolOp', async () => {
    await it('recognises request + response shapes', async () => {
      expect(isSessionProtocolOp({ kind: SNAPSHOT_REQUEST_KIND, payload: {}, peerId: 'a', seq: 0 })).toBe(true)
      expect(isSessionProtocolOp({ kind: SNAPSHOT_RESPONSE_KIND, payload: {}, peerId: 'a', seq: 0 })).toBe(true)
    })

    await it('rejects normal command kinds', async () => {
      expect(isSessionProtocolOp({ kind: 'tile.paint', payload: {}, peerId: 'a', seq: 0 })).toBe(false)
      expect(isSessionProtocolOp({ kind: 'placement.add', payload: {}, peerId: 'a', seq: 0 })).toBe(false)
    })

    await it('rejects malformed payloads', async () => {
      expect(isSessionProtocolOp(null)).toBe(false)
      expect(isSessionProtocolOp(42)).toBe(false)
      expect(isSessionProtocolOp('not an object')).toBe(false)
      expect(isSessionProtocolOp({})).toBe(false)
      expect(isSessionProtocolOp({ kind: 123 })).toBe(false)
    })

    await it('accepts any unknown future kind under the prefix', async () => {
      // Forward-compat: a v2 receiver should treat unknown
      // `__session/*` messages as protocol traffic, not as
      // commands. That keeps the registry path warning-free even
      // if the host runs a newer protocol version.
      expect(isSessionProtocolOp({ kind: '__session/future-feature', payload: {}, peerId: 'a', seq: 0 })).toBe(true)
    })
  })

  await describe('createSnapshotRequestOp', async () => {
    await it('builds a typed envelope with the right kind', async () => {
      const op = createSnapshotRequestOp({ peerId: 'joiner-1', seq: 7, roomId: 'abc' })
      expect(op.kind).toBe(SNAPSHOT_REQUEST_KIND)
      expect(op.payload).toStrictEqual({ roomId: 'abc' })
      expect(op.peerId).toBe('joiner-1')
      expect(op.seq).toBe(7)
      expect(isSessionProtocolOp(op)).toBe(true)
    })
  })

  await describe('createSnapshotResponseOp', async () => {
    await it('builds a typed envelope wrapping the snapshot', async () => {
      const op = createSnapshotResponseOp({ peerId: 'host-1', seq: 3, snapshot: FAKE_SNAPSHOT })
      expect(op.kind).toBe(SNAPSHOT_RESPONSE_KIND)
      expect(op.payload.snapshot.version).toBe(PROJECT_SNAPSHOT_VERSION)
      expect(op.payload.snapshot.projectFilename).toBe('game-project.json')
      expect(isSessionProtocolOp(op)).toBe(true)
    })
  })
}
