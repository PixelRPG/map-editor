import { describe, expect, it } from '@gjsify/unit'

import { THEME_PREFERENCES, coerceThemePreference, isThemePreference } from './theme-preference.ts'

export default async () => {
  await describe('isThemePreference', async () => {
    await it('accepts every documented nick', async () => {
      for (const nick of THEME_PREFERENCES) {
        expect(isThemePreference(nick)).toBe(true)
      }
    })

    await it('rejects unknown strings and non-strings', async () => {
      expect(isThemePreference('dark')).toBe(false)
      expect(isThemePreference('force-blue')).toBe(false)
      expect(isThemePreference('')).toBe(false)
      expect(isThemePreference(0)).toBe(false)
      expect(isThemePreference(null)).toBe(false)
      expect(isThemePreference(undefined)).toBe(false)
    })
  })

  await describe('coerceThemePreference', async () => {
    await it('passes valid nicks through', async () => {
      expect(coerceThemePreference('force-dark')).toBe('force-dark')
      expect(coerceThemePreference('force-light')).toBe('force-light')
      expect(coerceThemePreference('default')).toBe('default')
    })

    await it('falls back to following the OS for anything else', async () => {
      // Legacy/dconf-edited values and action targets must never crash the
      // style manager — they degrade to the OS scheme.
      expect(coerceThemePreference('dark')).toBe('default')
      expect(coerceThemePreference(undefined)).toBe('default')
      expect(coerceThemePreference(2)).toBe('default')
    })
  })
}
