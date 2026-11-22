import { describe, expect, it } from '@gjsify/unit'

import { addLanguage, makeDefaultLanguage, removeLanguage } from './languages-edit.ts'

const en = { default: 'en', others: ['de'] }

export default async () => {
  await describe('languages edit', async () => {
    await it('adds a new language at the end', async () => {
      expect(addLanguage(en, 'fr')).toStrictEqual({ default: 'en', others: ['de', 'fr'] })
    })

    await it('refuses a duplicate, the default and a malformed code', async () => {
      expect(addLanguage(en, 'de')).toBe(null)
      expect(addLanguage(en, 'en')).toBe(null)
      expect(addLanguage(en, 'x y')).toBe(null)
    })

    await it('removes a non-default language only', async () => {
      expect(removeLanguage(en, 'de')).toStrictEqual({ default: 'en', others: [] })
      expect(removeLanguage(en, 'en')).toBe(null)
      expect(removeLanguage(en, 'fr')).toBe(null)
    })

    await it('makes another language the default and keeps the old one', async () => {
      expect(makeDefaultLanguage(en, 'de')).toStrictEqual({ default: 'de', others: ['en'] })
      expect(makeDefaultLanguage({ default: 'en', others: ['de', 'fr'] }, 'fr')).toStrictEqual({
        default: 'fr',
        others: ['en', 'de'],
      })
      expect(makeDefaultLanguage(en, 'en')).toBe(null)
    })
  })
}
