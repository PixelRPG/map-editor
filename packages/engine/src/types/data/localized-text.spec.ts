import { describe, expect, it } from '@gjsify/unit'

import { isLocalizedText, languagesError, resolveText, withLocaleText } from './LocalizedText.ts'

export default async () => {
  await describe('resolveText', async () => {
    await it('passes a plain string through for any locale', async () => {
      expect(resolveText('hello', 'de', 'en')).toBe('hello')
    })

    await it('picks the requested locale, then its bare language, then the default, then the first entry', async () => {
      const text = { en: 'Hello', de: 'Hallo' }
      expect(resolveText(text, 'de', 'en')).toBe('Hallo')
      expect(resolveText(text, 'de-AT', 'en')).toBe('Hallo')
      expect(resolveText(text, 'fr', 'en')).toBe('Hello')
      expect(resolveText({ de: 'Hallo' }, 'fr', 'en')).toBe('Hallo')
      expect(resolveText({}, 'fr', 'en')).toBe('')
      expect(resolveText(undefined, 'en', 'en')).toBe('')
    })

    await it('does not read inherited keys', async () => {
      expect(resolveText({ de: 'Hallo' }, 'constructor', 'en')).toBe('Hallo')
    })
  })

  await describe('withLocaleText', async () => {
    await it('keeps a plain string plain when edited in the default language', async () => {
      expect(withLocaleText('Hi', 'en', 'Hey', 'en')).toBe('Hey')
    })

    await it('upgrades a plain string to a map when another language is written', async () => {
      expect(withLocaleText('Hi', 'de', 'Hallo', 'en')).toStrictEqual({ en: 'Hi', de: 'Hallo' })
    })
  })

  await describe('isLocalizedText / languagesError', async () => {
    await it('accepts strings and records of strings only', async () => {
      expect(isLocalizedText('a')).toBe(true)
      expect(isLocalizedText({ en: 'a' })).toBe(true)
      expect(isLocalizedText({ en: 1 })).toBe(false)
      expect(isLocalizedText(['a'])).toBe(false)
      expect(isLocalizedText(null)).toBe(false)
    })

    await it('rejects malformed language blocks', async () => {
      expect(languagesError({ default: 'en', others: ['de', 'pt-BR'] })).toBe(null)
      expect(languagesError({ default: 'English', others: [] })).not.toBe(null)
      expect(languagesError({ default: 'en', others: ['de', 'de'] })).not.toBe(null)
      expect(languagesError({ default: 'en', others: ['en'] })).not.toBe(null)
      expect(languagesError({ default: 'en', others: ['../x'] })).not.toBe(null)
      expect(languagesError({ default: 'en' })).not.toBe(null)
      expect(languagesError(null)).not.toBe(null)
    })
  })
}
