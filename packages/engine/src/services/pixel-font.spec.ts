import { describe, expect, it } from '@gjsify/unit'

import { createAdvanceFn } from './font-metrics'
import { FUSION_PIXEL_12_METRICS } from './fusion-pixel-12-metrics'
import { chooseAdvance, loadPixelFont, pixelAdvance, pixelFontReady } from './pixel-font'

const table = createAdvanceFn(FUSION_PIXEL_12_METRICS)
const tableWidth = (text: string) => [...text].reduce((sum, ch) => sum + table(ch), 0)

export default async () => {
  await describe('chooseAdvance', async () => {
    await it('keeps the static table when the canvas measures the same widths', async () => {
      const choice = chooseAdvance(tableWidth)
      expect(choice.mismatch).toBe(false)
      expect(choice.advance('a')).toBe(6)
    })

    await it('switches to measured advances when the canvas draws another font', async () => {
      // A fallback sans: every glyph 8 px wide, nothing like the table.
      const choice = chooseAdvance((text) => [...text].length * 8)
      expect(choice.mismatch).toBe(true)
      expect(choice.advance('a')).toBe(8)
      expect(choice.advance('\u2014')).toBe(8)
    })
  })

  await describe('loadPixelFont', async () => {
    await it('settles, marks the font ready and leaves layout with the table widths', async () => {
      await loadPixelFont()
      expect(pixelFontReady()).toBe(true)
      expect(pixelAdvance('a')).toBe(6)
      expect(pixelAdvance('\u2014')).toBe(12)
    })

    await it('is idempotent', async () => {
      expect(loadPixelFont()).toBe(loadPixelFont())
    })
  })
}
