import { describe, expect, it } from '@gjsify/unit'

import { buildPixelrpgJoinUrl, parsePixelrpgUrl, pickPixelrpgIntent } from './pixelrpg-url.ts'

export default async () => {
  await describe('parsePixelrpgUrl', async () => {
    await it('parses the canonical pixelrpg://join/<roomid>', async () => {
      expect(parsePixelrpgUrl('pixelrpg://join/a3f2bb91')).toStrictEqual({ kind: 'join', roomId: 'a3f2bb91' })
    })

    await it('tolerates a leading double slash (some launchers add it)', async () => {
      expect(parsePixelrpgUrl('pixelrpg:///join/a3f2bb91')).toStrictEqual({ kind: 'join', roomId: 'a3f2bb91' })
    })

    await it('strips trailing query / fragment', async () => {
      expect(parsePixelrpgUrl('pixelrpg://join/a3f2bb91?source=chat')).toStrictEqual({
        kind: 'join',
        roomId: 'a3f2bb91',
      })
      expect(parsePixelrpgUrl('pixelrpg://join/a3f2bb91#friend')).toStrictEqual({ kind: 'join', roomId: 'a3f2bb91' })
    })

    await it('rejects an unknown scheme', async () => {
      expect(parsePixelrpgUrl('https://example.com/join/abc')).toBeNull()
    })

    await it('rejects an unknown action', async () => {
      expect(parsePixelrpgUrl('pixelrpg://settings/foo')).toBeNull()
    })

    await it('rejects malformed / missing room id', async () => {
      expect(parsePixelrpgUrl('pixelrpg://join/')).toBeNull()
      expect(parsePixelrpgUrl('pixelrpg://join/has spaces')).toBeNull()
      expect(parsePixelrpgUrl('pixelrpg://join/abc/def')).toStrictEqual({ kind: 'join', roomId: 'abc' })
    })

    await it('rejects a wildly-malformed payload', async () => {
      expect(parsePixelrpgUrl('')).toBeNull()
      expect(parsePixelrpgUrl('pixelrpg://')).toBeNull()
      expect(parsePixelrpgUrl('pixelrpg://abc')).toBeNull()
    })
  })

  await describe('buildPixelrpgJoinUrl', async () => {
    await it('builds the canonical join URL', async () => {
      expect(buildPixelrpgJoinUrl('a3f2bb91')).toBe('pixelrpg://join/a3f2bb91')
    })

    await it('round-trips through parsePixelrpgUrl', async () => {
      const roomId = 'room-7c-abc_4'
      expect(parsePixelrpgUrl(buildPixelrpgJoinUrl(roomId))).toStrictEqual({ kind: 'join', roomId })
    })

    await it('throws on a roomId the parser would reject', async () => {
      expect(() => buildPixelrpgJoinUrl('')).toThrow()
      expect(() => buildPixelrpgJoinUrl('has spaces')).toThrow()
      expect(() => buildPixelrpgJoinUrl('weird.dot')).toThrow()
    })
  })

  await describe('pickPixelrpgIntent', async () => {
    await it('returns the first valid intent in argv', async () => {
      const argv = ['/usr/bin/org.pixelrpg.maker', '--debug', 'pixelrpg://join/a3f2bb91', 'pixelrpg://join/zz9z9z9z']
      expect(pickPixelrpgIntent(argv)).toStrictEqual({ kind: 'join', roomId: 'a3f2bb91' })
    })

    await it('returns null when no pixelrpg URL is present', async () => {
      expect(pickPixelrpgIntent(['/usr/bin/org.pixelrpg.maker'])).toBeNull()
      expect(pickPixelrpgIntent(['arg1', 'arg2', 'arg3'])).toBeNull()
    })
  })
}
