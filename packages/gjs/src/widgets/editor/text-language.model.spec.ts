import { describe, expect, it } from '@gjsify/unit'
import { textShown, textWritten, TextLanguageState } from './text-language.model.ts'

export default async () => {
  await describe('text language model', async () => {
    await it('shows the default wording in the default language', async () => {
      expect(textShown({ en: 'hi', de: 'hallo' }, 'en', 'en')).toStrictEqual({ value: 'hi', hint: '' })
      expect(textShown('hi', 'en', 'en')).toStrictEqual({ value: 'hi', hint: '' })
    })

    await it('shows only an existing translation, with the default as hint', async () => {
      expect(textShown({ en: 'hi', de: 'hallo' }, 'de', 'en')).toStrictEqual({ value: 'hallo', hint: 'hi' })
      expect(textShown('hi', 'de', 'en')).toStrictEqual({ value: '', hint: 'hi' })
      expect(textShown({ en: 'hi' }, 'de', 'en')).toStrictEqual({ value: '', hint: 'hi' })
    })

    await it('writes a translation without touching the default', async () => {
      expect(textWritten('hi', 'de', 'en', 'hallo')).toStrictEqual({ en: 'hi', de: 'hallo' })
      expect(textWritten({ en: 'hi' }, 'de', 'en', 'hallo')).toStrictEqual({ en: 'hi', de: 'hallo' })
    })

    await it('removes an emptied translation but keeps an emptied default', async () => {
      expect(textWritten({ en: 'hi', de: 'hallo' }, 'de', 'en', '')).toStrictEqual({ en: 'hi' })
      expect(textWritten('hi', 'de', 'en', '')).toBe('hi')
      expect(textWritten('hi', 'en', 'en', '')).toBe('')
    })

    await it('cycles through the languages and falls back when one goes', async () => {
      const state = new TextLanguageState()
      expect(state.multi).toBe(false)
      state.setLanguages({ default: 'en', others: ['de', 'fr'] })
      expect(state.multi).toBe(true)
      let refreshed = 0
      state.track(() => refreshed++)
      state.cycle()
      expect(state.locale).toBe('de')
      state.cycle()
      state.cycle()
      expect(state.locale).toBe('en')
      expect(refreshed).toBe(3)
      state.cycle()
      state.setLanguages({ default: 'en', others: ['fr'] })
      expect(state.locale).toBe('en')
    })
  })
}
