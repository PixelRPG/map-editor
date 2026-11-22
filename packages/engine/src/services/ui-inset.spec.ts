import { describe, expect, it } from '@gjsify/unit'
import type { Engine as ExcaliburEngine } from 'excalibur'
import { EMPTY_UI_INSET, getUiInset, normalizeUiInset, setUiInset } from './ui-inset.ts'

export default async () => {
  await describe('ui-inset', async () => {
    await it('drops values that are not a positive finite number', async () => {
      expect(normalizeUiInset({ bottom: Number.NaN })).toBe(EMPTY_UI_INSET)
      expect(normalizeUiInset({ bottom: -4 })).toBe(EMPTY_UI_INSET)
      expect(normalizeUiInset(null)).toBe(EMPTY_UI_INSET)
      expect(normalizeUiInset({ bottom: 88 }).bottom).toBe(88)
    })

    await it('keeps one inset per engine and updates it', async () => {
      const a = {} as ExcaliburEngine
      const b = {} as ExcaliburEngine
      setUiInset(a, { bottom: 88 })
      expect(getUiInset(a).bottom).toBe(88)
      expect(getUiInset(b)).toBe(EMPTY_UI_INSET)
      setUiInset(a, null)
      expect(getUiInset(a)).toBe(EMPTY_UI_INSET)
    })
  })
}
