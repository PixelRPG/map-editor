import { describe, expect, it } from '@gjsify/unit'

import { formatRelativeTime } from './recent-time.ts'

export default async () => {
  await describe('formatRelativeTime', async () => {
    // Fixed reference: 2026-07-02 15:00 local time.
    const now = new Date(2026, 6, 2, 15, 0).getTime()

    await it('renders same-day timestamps as "today, HH:MM"', async () => {
      const at = new Date(2026, 6, 2, 14, 32).getTime()
      expect(formatRelativeTime(at, now)).toBe('today, 14:32')
      const morning = new Date(2026, 6, 2, 8, 5).getTime()
      expect(formatRelativeTime(morning, now)).toBe('today, 08:05')
    })

    await it('treats future timestamps (clock skew) as today', async () => {
      const future = new Date(2026, 6, 2, 23, 59).getTime()
      expect(formatRelativeTime(future, now)).toBe('today, 23:59')
    })

    await it('renders yesterday and day counts', async () => {
      expect(formatRelativeTime(new Date(2026, 6, 1, 22, 0).getTime(), now)).toBe('yesterday')
      expect(formatRelativeTime(new Date(2026, 5, 29, 9, 0).getTime(), now)).toBe('3 days ago')
      expect(formatRelativeTime(new Date(2026, 5, 26, 9, 0).getTime(), now)).toBe('6 days ago')
    })

    await it('renders week buckets', async () => {
      expect(formatRelativeTime(new Date(2026, 5, 24, 9, 0).getTime(), now)).toBe('last week')
      expect(formatRelativeTime(new Date(2026, 5, 10, 9, 0).getTime(), now)).toBe('3 weeks ago')
    })

    await it('falls back to an absolute date beyond ~2 months', async () => {
      expect(formatRelativeTime(new Date(2026, 3, 1, 9, 0).getTime(), now)).toBe('2026-04-01')
    })
  })
}
