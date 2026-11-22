import { describe, expect, it } from '@gjsify/unit'
import { createAdvanceFn } from './font-metrics.ts'
import { FUSION_PIXEL_12_METRICS } from './fusion-pixel-12-metrics.ts'
import { layoutText } from './text-layout.ts'
import { DIALOGUE_BOTTOM_MARGIN, DIALOGUE_DESIGN, dialogueGeometry, revealWidths } from './dialogue-layout.ts'
import {
  advanceReveal,
  confirmDialogue,
  type DialogueData,
  isPageRevealed,
  pageChars,
  takeConfirm,
  visibleChars,
} from './dialogue-state.ts'

function data(pages: string[][], over: Partial<DialogueData> = {}): DialogueData {
  return { pages, page: 0, revealed: 0, confirmWasHeld: false, tapQueued: false, ...over }
}

export default async () => {
  await describe('dialogue state machine', async () => {
    await it('counts the characters of a page, not its line breaks', async () => {
      expect(pageChars(['ab', 'cde'])).toBe(5)
      expect(pageChars(['Größe'])).toBe(5)
    })

    await it('reveals over time and stops at the end of the page', async () => {
      const d = data([['abcd']])
      advanceReveal(d, 50, false)
      expect(visibleChars(d)).toBe(2)
      advanceReveal(d, 10_000, false)
      expect(visibleChars(d)).toBe(4)
      expect(isPageRevealed(d)).toBe(true)
    })

    await it('shows a page at once when motion is reduced', async () => {
      const d = data([['abcd']])
      advanceReveal(d, 0, true)
      expect(isPageRevealed(d)).toBe(true)
    })

    await it('first confirm completes the reveal, the next advances, the last closes', async () => {
      const d = data([['abcd'], ['ef']])
      expect(confirmDialogue(d)).toBe('completed')
      expect(d.page).toBe(0)
      expect(isPageRevealed(d)).toBe(true)
      expect(confirmDialogue(d)).toBe('advanced')
      expect(d.page).toBe(1)
      expect(d.revealed).toBe(0)
      expect(confirmDialogue(d)).toBe('completed')
      expect(confirmDialogue(d)).toBe('closed')
    })
  })

  await describe('dialogue input mapping', async () => {
    await it('counts a held key once, on its rising edge', async () => {
      const d = data([['a']])
      expect(takeConfirm(d, true)).toBe(true)
      expect(takeConfirm(d, true)).toBe(false)
      expect(takeConfirm(d, false)).toBe(false)
      expect(takeConfirm(d, true)).toBe(true)
    })

    await it('does not count the press that opened the box until it is released', async () => {
      const d = data([['a']], { confirmWasHeld: true })
      expect(takeConfirm(d, true)).toBe(false)
      expect(takeConfirm(d, false)).toBe(false)
      expect(takeConfirm(d, true)).toBe(true)
    })

    await it('counts a queued tap once and consumes it', async () => {
      const d = data([['a']], { tapQueued: true })
      expect(takeConfirm(d, false)).toBe(true)
      expect(takeConfirm(d, false)).toBe(false)
    })
  })

  await describe('dialogue layout', async () => {
    await it('uses a whole number of device pixels per UI pixel', async () => {
      for (const [w, h] of [
        [1920, 1200],
        [2400, 1500],
        [400, 880],
        [3840, 2400],
      ]) {
        const g = dialogueGeometry({ width: w, height: h })
        expect(Number.isInteger(g.k)).toBe(true)
        expect(g.k >= 1).toBe(true)
        expect(g.originX >= 0).toBe(true)
        expect(g.originY + (g.boxHeight + 14) * g.k <= h).toBe(true)
      }
      expect(dialogueGeometry({ width: 1920, height: 1200 }).k).toBe(Math.floor(1200 / DIALOGUE_DESIGN.height))
    })

    await it('wraps every page to the inner width that is drawn, on a phone too', async () => {
      const advance = createAdvanceFn(FUSION_PIXEL_12_METRICS)
      const text =
        'Willkommen im Kokiri-Wald, kleiner Wanderer! Die Wege sind weit, das Gras ist hoch und der Waldteich ist tief, also gib gut acht. Komm zurück und erzähl mir von der Straßenbahn-Haltestelle, dem Fußgängerübergangsschild und allem, was du heute entdeckt hast, ja?'
      for (const [w, h, inset] of [
        [400, 880, 0],
        [400, 880, 88],
        [1920, 1200, 0],
      ]) {
        const g = dialogueGeometry({ width: w, height: h }, inset)
        const pages = layoutText(text, { maxWidth: g.textWidth, advance })
        for (const page of pages) {
          for (const line of page.lines) {
            let width = 0
            for (const ch of line) width += advance(ch)
            expect(width <= g.textWidth).toBe(true)
          }
        }
        const shown = pages
          .map((p) => p.lines.join(' '))
          .join(' ')
          .replace(/-? /g, '')
        expect(shown.includes('Fußgängerübergangsschild')).toBe(true)
        expect(shown.endsWith('ja?')).toBe(true)
      }
    })

    await it('sits on the bottom safe area, above the inset', async () => {
      const plain = dialogueGeometry({ width: 1920, height: 1200 })
      const lifted = dialogueGeometry({ width: 1920, height: 1200 }, 200)
      expect(lifted.originY < plain.originY).toBe(true)
      expect(plain.originY - lifted.originY).toBe(200)
    })

    await it('keeps a whole-pixel gap under the box', async () => {
      const g = dialogueGeometry({ width: 1920, height: 1200 })
      const gap = 1200 - (g.originY + (g.boxHeight + 14) * g.k)
      expect(gap).toBe(DIALOGUE_BOTTOM_MARGIN * g.k)
    })

    await it('clips the typewriter per line', async () => {
      const adv = () => 6
      expect(revealWidths(['abc', 'de'], 0, adv)).toStrictEqual([0, 0])
      expect(revealWidths(['abc', 'de'], 2, adv)).toStrictEqual([12, 0])
      expect(revealWidths(['abc', 'de'], 4, adv)).toStrictEqual([18, 6])
      expect(revealWidths(['abc', 'de'], 99, adv)).toStrictEqual([18, 12])
    })
  })
}
