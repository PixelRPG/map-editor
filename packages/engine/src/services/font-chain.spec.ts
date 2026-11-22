import { describe, expect, it } from '@gjsify/unit'

import { DEFAULT_FONT_CHAINS, DEFAULT_FONT_ID, fontForChar, resolveFontChain } from './font-chain'

export default async () => {
  await describe('resolveFontChain', async () => {
    await it('is the default font alone for every shipped language', async () => {
      expect(Object.keys(DEFAULT_FONT_CHAINS).length).toBe(0)
      for (const locale of ['en', 'de', 'de-AT', 'pt-BR', 'xx']) {
        expect(resolveFontChain(locale)).toStrictEqual([DEFAULT_FONT_ID])
      }
    })

    await it('puts a language font in front and keeps the default last', async () => {
      const table = { ar: ['noto-arabic'], 'zh-hant': ['hant-font', 'zh-font'] }
      expect(resolveFontChain('ar', table)).toStrictEqual(['noto-arabic', DEFAULT_FONT_ID])
      expect(resolveFontChain('AR-EG', table)).toStrictEqual(['noto-arabic', DEFAULT_FONT_ID])
      expect(resolveFontChain('zh-Hant', table)).toStrictEqual(['hant-font', 'zh-font', DEFAULT_FONT_ID])
      expect(resolveFontChain('de', table)).toStrictEqual([DEFAULT_FONT_ID])
    })

    await it('prefers the full tag over its language and lists each font once', async () => {
      const table = { zh: ['zh-font'], 'zh-tw': ['tw-font', DEFAULT_FONT_ID] }
      expect(resolveFontChain('zh-TW', table)).toStrictEqual(['tw-font', DEFAULT_FONT_ID])
      expect(resolveFontChain('zh-CN', table)).toStrictEqual(['zh-font', DEFAULT_FONT_ID])
    })

    await it('does not read inherited keys', async () => {
      expect(resolveFontChain('constructor', {})).toStrictEqual([DEFAULT_FONT_ID])
    })
  })

  await describe('fontForChar', async () => {
    await it('takes the first font that covers the character, else the last', async () => {
      const covers = (id: string, ch: string): boolean => (id === 'arabic' ? ch === 'م' : ch !== 'م')
      expect(fontForChar(['arabic', DEFAULT_FONT_ID], 'م', covers)).toBe('arabic')
      expect(fontForChar(['arabic', DEFAULT_FONT_ID], 'a', covers)).toBe(DEFAULT_FONT_ID)
      expect(fontForChar(['a', 'b'], 'x', () => false)).toBe('b')
    })
  })
}
