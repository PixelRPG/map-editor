/**
 * The relay's admission rules, as pure functions.
 *
 * Everything a peer is allowed to do is decided here before a socket is
 * seated: which room it lands in, which slot, and whether a frame is
 * relayable at all. The e2e suite exercises the happy path against a real
 * server; these cases pin the refusals, which are cheap to get subtly wrong
 * (a widened room-id pattern would let a peer address `/room/../x`, and a
 * `peekType` that answered `'undefined'` instead of `null` would relay
 * junk).
 *
 * `extractUrl` is the two-runtime seam: `ws` under Node hands over an
 * `http.IncomingMessage` with `.url`, @gjsify/ws a `Soup.ServerMessage`
 * with `get_uri()`. Both shapes are covered because only one of them is
 * ever exercised by the e2e run.
 */

import { describe, expect, it } from '@gjsify/unit'

import { extractUrl, parsePath, peekType } from './request-routing.ts'

export default async () => {
  await describe('parsePath', async () => {
    await it('accepts a room path with an explicit role', async () => {
      expect(parsePath('/room/abc-123?role=host')).toStrictEqual({ ok: true, roomId: 'abc-123', role: 'host' })
      expect(parsePath('/room/abc_123?role=joiner')).toStrictEqual({ ok: true, roomId: 'abc_123', role: 'joiner' })
    })

    await it('rejects a path outside /room/<id>', async () => {
      expect(parsePath('/?role=host')).toStrictEqual({ ok: false, reason: 'bad-path' })
      expect(parsePath('/room/a/b?role=host')).toStrictEqual({ ok: false, reason: 'bad-path' })
    })

    await it('rejects a room id outside the allowed charset or length', async () => {
      expect(parsePath('/room/../secret?role=host')).toStrictEqual({ ok: false, reason: 'bad-path' })
      expect(parsePath(`/room/${'a'.repeat(65)}?role=host`)).toStrictEqual({ ok: false, reason: 'bad-path' })
      expect(parsePath(`/room/${'a'.repeat(64)}?role=host`).ok).toBe(true)
    })

    await it('rejects a missing or unknown role', async () => {
      expect(parsePath('/room/abc')).toStrictEqual({ ok: false, reason: 'bad-role' })
      expect(parsePath('/room/abc?role=spectator')).toStrictEqual({ ok: false, reason: 'bad-role' })
    })

    await it('rejects a URL it cannot parse at all', async () => {
      expect(parsePath('http://[')).toStrictEqual({ ok: false, reason: 'bad-url' })
    })
  })

  await describe('extractUrl', async () => {
    await it("reads Node's `.url` when present", async () => {
      expect(extractUrl({ url: '/room/a?role=host' })).toBe('/room/a?role=host')
    })

    await it('rebuilds path + query from a Soup message', async () => {
      const soup = { get_uri: () => ({ get_path: () => '/room/a', get_query: () => 'role=joiner' }) }
      expect(extractUrl(soup)).toBe('/room/a?role=joiner')
    })

    await it('omits the query separator when Soup reports no query', async () => {
      const soup = { get_uri: () => ({ get_path: () => '/room/a', get_query: () => null }) }
      expect(extractUrl(soup)).toBe('/room/a')
    })

    await it('answers an empty string for a request of neither shape', async () => {
      expect(extractUrl({})).toBe('')
    })
  })

  await describe('peekType', async () => {
    await it('reads the discriminator without touching the payload', async () => {
      expect(peekType(JSON.stringify({ type: 'sdp', payload: { anything: true } }))).toBe('sdp')
    })

    await it('answers null for a frame with no string discriminator', async () => {
      expect(peekType(JSON.stringify({ payload: {} }))).toBe(null)
      expect(peekType(JSON.stringify({ type: 7 }))).toBe(null)
    })

    await it('answers null for a frame that is not JSON', async () => {
      expect(peekType('not json')).toBe(null)
    })
  })
}
