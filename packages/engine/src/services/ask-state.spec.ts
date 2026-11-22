import { describe, expect, it } from '@gjsify/unit'
import { createAdvanceFn } from './font-metrics.ts'
import { FUSION_PIXEL_12_METRICS } from './fusion-pixel-12-metrics.ts'
import { askLayout, hitRow } from './ask-layout.ts'
import { type AskBoxData, type AskData, newAskData, optionsOpen, stepAsk } from './ask-state.ts'
import { dialogueGeometry } from './dialogue-layout.ts'

const advance = createAdvanceFn(FUSION_PIXEL_12_METRICS)
const idle = { menuY: 0, confirmHeld: false, cancelHeld: false }

function fresh(count = 3, cancel: number | null = null): AskData {
  const d = newAskData(count, cancel)
  stepAsk(d, idle) // the opening press is released
  return d
}

function box(over: Partial<AskBoxData> = {}): AskBoxData {
  return { pages: [['a'], ['b']], page: 1, revealed: 99, confirmWasHeld: false, tapQueued: false, hold: true, ...over }
}

export default async () => {
  await describe('ask state machine', async () => {
    await it('opens its rows only on the last, fully revealed page of a held box', async () => {
      expect(optionsOpen(box())).toBe(true)
      expect(optionsOpen(box({ page: 0 }))).toBe(false)
      expect(optionsOpen(box({ revealed: 0 }))).toBe(false)
      expect(optionsOpen(box({ hold: false }))).toBe(false)
    })

    await it('ignores the press that was still held when the question opened', async () => {
      const d = newAskData(2, null)
      expect(stepAsk(d, { ...idle, confirmHeld: true })).toBe(null)
      stepAsk(d, idle)
      expect(stepAsk(d, { ...idle, confirmHeld: true })).toBe(0)
    })

    await it('moves the highlight once per press and wraps', async () => {
      const d = fresh(3)
      stepAsk(d, { ...idle, menuY: 1 })
      stepAsk(d, { ...idle, menuY: 1 }) // held: no repeat
      expect(d.highlight).toBe(1)
      stepAsk(d, idle)
      stepAsk(d, { ...idle, menuY: -1 })
      stepAsk(d, idle)
      stepAsk(d, { ...idle, menuY: -1 })
      expect(d.highlight).toBe(2)
    })

    await it('picks the highlighted row on confirm, with no timer', async () => {
      const d = fresh(3)
      stepAsk(d, { ...idle, menuY: 1 })
      for (let i = 0; i < 1000; i++) expect(stepAsk(d, { ...idle, menuY: 0 })).toBe(null)
      expect(stepAsk(d, { ...idle, confirmHeld: true })).toBe(1)
    })

    await it('cancels only when a cancel option is set', async () => {
      const without = fresh(3)
      expect(stepAsk(without, { ...idle, cancelHeld: true })).toBe(null)
      const withCancel = fresh(3, 2)
      expect(stepAsk(withCancel, { ...idle, cancelHeld: true })).toBe(2)
    })
  })

  await describe('ask layout', async () => {
    const long = 'Ja, ich helfe dir gerne bei der Suche nach dem verlorenen Schlüssel im Wald'
    const labels = [long, long, long, long]

    await it('stacks four long German rows above the box on a 400x880 phone, clear of the inset', async () => {
      const inset = 200
      const g = dialogueGeometry({ width: 400, height: 880 }, inset)
      const l = askLayout(g, labels, advance)
      expect(l.fits).toBe(true)
      expect(l.rows.length).toBe(4)
      for (const row of l.rows) {
        expect(row.x >= 0 && row.x + row.width <= 400).toBe(true)
        expect(row.y + row.height <= g.originY).toBe(true)
        expect(row.y + row.height <= 880 - inset).toBe(true)
        expect(row.height >= 44 * g.k).toBe(true)
      }
    })

    await it('keeps rows from overlapping and tall enough to tap', async () => {
      const g = dialogueGeometry({ width: 1920, height: 1200 }, 0)
      const l = askLayout(g, ['A', 'B', 'C'], advance)
      for (let i = 1; i < l.rows.length; i++) expect(l.rows[i].y >= l.rows[i - 1].y + l.rows[i - 1].height).toBe(true)
      expect(l.rows[0].height).toBeGreaterThan(27 * g.k)
    })

    await it('hit-tests a tap onto its row and nothing outside', async () => {
      const g = dialogueGeometry({ width: 1920, height: 1200 }, 0)
      const l = askLayout(g, ['A', 'B', 'C'], advance)
      for (const row of l.rows) expect(hitRow(l, row.x + row.width / 2, row.y + row.height / 2)).toBe(row.index)
      expect(hitRow(l, l.x - 1, l.y + 1)).toBe(-1)
      expect(hitRow(l, l.x + 1, g.originY + 1)).toBe(-1)
    })
  })
}
