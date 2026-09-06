import { describe, expect, it } from '@gjsify/unit'

import { coerceUiTier, DEFAULT_UI_TIER, isFullView, isUiTier, tierForFullView, UI_TIERS } from './ui-tier.ts'

export default async () => {
  await describe('ui-tier', async () => {
    await it('accepts exactly the two documented nicks', async () => {
      for (const nick of UI_TIERS) expect(isUiTier(nick)).toBe(true)
      expect(isUiTier('beginner')).toBe(false)
      expect(isUiTier('advanced')).toBe(false)
      expect(isUiTier('')).toBe(false)
      expect(isUiTier(1)).toBe(false)
      expect(isUiTier(null)).toBe(false)
    })

    await it('defaults to Simple, silently, for anything it does not know', async () => {
      // No first-run question: a stale or dconf-edited value lands in the
      // tier that hides nothing a child needs.
      expect(DEFAULT_UI_TIER).toBe('simple')
      expect(coerceUiTier('full')).toBe('full')
      expect(coerceUiTier('simple')).toBe('simple')
      expect(coerceUiTier('expert')).toBe('simple')
      expect(coerceUiTier(undefined)).toBe('simple')
    })

    await it('round-trips the Full-view boolean the switches bind to', async () => {
      expect(isFullView('full')).toBe(true)
      expect(isFullView('simple')).toBe(false)
      expect(tierForFullView(true)).toBe('full')
      expect(tierForFullView(false)).toBe('simple')
      for (const tier of UI_TIERS) expect(tierForFullView(isFullView(tier))).toBe(tier)
    })
  })
}
