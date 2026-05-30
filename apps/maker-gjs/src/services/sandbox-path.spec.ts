import { describe, expect, it } from '@gjsify/unit'

import { sanitiseRoomId } from './sandbox-path.ts'

export default async () => {
  await describe('sanitiseRoomId', async () => {
    await it('passes through the alphabet the wire-format guarantees', async () => {
      expect(sanitiseRoomId('abc123_-XYZ')).toBe('abc123_-XYZ')
    })

    await it('replaces path separators + escape attempts', async () => {
      expect(sanitiseRoomId('../etc/passwd')).toBe('___etc_passwd')
      expect(sanitiseRoomId('a/b\\c')).toBe('a_b_c')
      expect(sanitiseRoomId('..')).toBe('__')
    })

    await it('truncates over-long inputs at 64 characters', async () => {
      const long = 'x'.repeat(200)
      expect(sanitiseRoomId(long).length).toBe(64)
    })

    await it('returns "unnamed" for empty / all-invalid input', async () => {
      expect(sanitiseRoomId('')).toBe('unnamed')
      // After sanitisation `///` becomes `___` which is not empty,
      // but the all-invalid edge case `''` falls through to the
      // sentinel.
      expect(sanitiseRoomId(undefined as unknown as string)).toBe('unnamed')
    })

    await it('rejects NUL bytes by replacing them', async () => {
      expect(sanitiseRoomId('safe\0/etc/passwd')).toBe('safe__etc_passwd')
    })
  })
}
