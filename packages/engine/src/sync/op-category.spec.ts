/**
 * `classifyOp` — the category half of an op's identity on the reliable
 * channel.
 *
 * The bug it closes: three message families share one channel, each
 * with its OWN sequence counter starting at 0, all stamping the same
 * `peerId`. `(peerId, seq)` therefore names up to three different ops
 * at once, and every dedupe/watermark keyed on that pair alone was
 * relying on `CollabSession`'s routing to keep the families apart — an
 * invariant nothing enforced.
 */

import { describe, expect, it } from '@gjsify/unit'

import { assertCommandOp, classifyOp, OpCategoryError } from './op-category.ts'
import { ENTITY_UPSERT_KIND, SPRITESET_ADD_CHUNK_KIND } from './project-operations.ts'
import { SNAPSHOT_CHUNK_KIND, SNAPSHOT_REQUEST_KIND } from './session-protocol.ts'

export default async () => {
  await describe('classifyOp', async () => {
    await it('separates the three families that share one peerId/seq keyspace', async () => {
      const seq = 0
      const peerId = 'host'
      expect(classifyOp({ kind: 'tile.paint', payload: {}, peerId, seq })).toBe('command')
      expect(classifyOp({ kind: ENTITY_UPSERT_KIND, payload: {}, peerId, seq })).toBe('project')
      expect(classifyOp({ kind: SPRITESET_ADD_CHUNK_KIND, payload: {}, peerId, seq })).toBe('project')
      expect(classifyOp({ kind: SNAPSHOT_REQUEST_KIND, payload: {}, peerId, seq })).toBe('session-protocol')
      expect(classifyOp({ kind: SNAPSHOT_CHUNK_KIND, payload: {}, peerId, seq })).toBe('session-protocol')
    })

    await it('treats anything unprefixed (malformed included) as a command op', async () => {
      // Command replay already tolerates malformed shapes on its own
      // terms; classification must not become a second silent filter.
      expect(classifyOp(null)).toBe('command')
      expect(classifyOp('not-an-op')).toBe('command')
      expect(classifyOp({ kind: 42 })).toBe('command')
      expect(classifyOp({})).toBe('command')
    })
  })

  await describe('assertCommandOp', async () => {
    await it('passes a command op through', async () => {
      let threw = false
      try {
        assertCommandOp({ kind: 'object.remove', payload: {}, peerId: 'host', seq: 3 })
      } catch {
        threw = true
      }
      expect(threw).toBe(false)
    })

    await it('throws a typed error naming both categories', async () => {
      let thrown: unknown = null
      try {
        assertCommandOp({ kind: ENTITY_UPSERT_KIND, payload: {}, peerId: 'host', seq: 3 })
      } catch (error) {
        thrown = error
      }
      expect(thrown instanceof OpCategoryError).toBe(true)
      const error = thrown as OpCategoryError
      expect(error.expected).toBe('command')
      expect(error.actual).toBe('project')
      expect(error.kind).toBe(ENTITY_UPSERT_KIND)
    })
  })
}
