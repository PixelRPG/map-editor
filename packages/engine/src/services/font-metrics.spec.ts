import { describe, expect, it } from '@gjsify/unit'

import { coversText, createAdvanceFn } from './font-metrics'
import { FUSION_PIXEL_12_METRICS as FUSION } from './fusion-pixel-12-metrics'
import { layoutText, measureText } from './text-layout'

export default async () => {
  await describe('Fusion Pixel 12 metrics', async () => {
    const advance = createAdvanceFn(FUSION)

    await it('measures the glyphs of the 12 px proportional font', async () => {
      expect(FUSION.size).toBe(12)
      expect(advance('a')).toBe(6)
      expect(advance(' ')).toBe(6)
      expect(advance('\u00B7')).toBe(4)
      expect(advance('\u2014')).toBe(12)
      expect(advance('\u2026')).toBe(8)
    })

    await it('covers German text, typographic quotes and the catalogue symbols', async () => {
      const german = 'Äpfel, Öl, Übung, ändern, öffnen, über, Straße. „Hallo“ — wie geht’s? 12 × 3 … a · b → c ↔ d'
      expect(coversText(FUSION, german)).toBe(true)
      expect(coversText(FUSION, 'ĀāĂăŁłŒœ')).toBe(true)
    })

    await it('reports a character the subset leaves out and measures it as .notdef', async () => {
      expect(coversText(FUSION, '日本')).toBe(false)
      expect(advance('日')).toBe(FUSION.fallbackAdvance)
    })

    await it('lays out with the real advances', async () => {
      const pages = layoutText('Willkommen in Kokiri, kleiner Abenteurer! Der Weg zum Wald ist weit.', {
        maxWidth: 120,
        advance,
      })
      expect(pages.length > 0).toBe(true)
      for (const page of pages) {
        expect(page.lines.length <= 3).toBe(true)
        for (const line of page.lines) expect(measureText(line, advance) <= 120).toBe(true)
      }
    })
  })
}
