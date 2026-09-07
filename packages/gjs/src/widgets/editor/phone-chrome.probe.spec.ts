/**
 * The scene editor's chrome, measured by GTK instead of by eye.
 *
 * Phone: the docked bar and the Brush sheet must fit the ladder's floor
 * width, because `Adw.BreakpointBin` ignores its child's minimum — a
 * child that wants more is allocated past the window's edge with a
 * warning nobody reads, not refused. The wide layout's pill table is
 * checked against the real widget for the same reason. Needs GTK and a
 * display, so it runs on a workstation and skips (counted as ignored,
 * never as passed) under the node target and on a headless runner —
 * see `pixel-probe.ts` for why the display question is asked once.
 */

import { describe, expect, it } from '@gjsify/unit'

import { type ChromeStage, CHROME_STAGES, CONTEXT_PILL_PX, STAGE_EDITING_PILL_PX } from './chrome-stages.ts'
import type { PhoneChromeReport } from './phone-chrome.probe.ts'
import { RECENT_BUTTON_PX, RECENT_PITCH_PX, RECENT_TILES_MAX, wholeCount } from './recent-tiles.geometry.ts'

/** GJS is the only target with GTK; the node target stubs `gi://` and must never evaluate the widget. */
const isGjs = typeof (globalThis as { imports?: unknown }).imports !== 'undefined'

/**
 * The icon-only rungs and the solo context pill hold no text, so they
 * measure the same on every machine. The rungs with "World", the brush
 * sentence and the six verbs move with the font — CI's stack renders
 * them up to 14 px wider than a workstation's — so for those only the
 * UNSAFE direction is held tightly: a table lower than the widget lets a
 * rung in whose pills then overlap; a table a little higher merely
 * delays the rung by pixels nobody sees.
 */
const EXACT_PX = 2
const TEXT_LOW_PX = 2
const TEXT_HIGH_PX = 24
const TEXT_FREE_STAGES: readonly ChromeStage[] = ['tight', 'compact']

export default async () => {
  await describe('scene editor chrome — measured by GTK', async () => {
    const rig = isGjs ? await import('./pixel-probe.ts') : null
    const probe = isGjs ? await import('./phone-chrome.probe.ts') : null
    if (!rig?.hasDisplay() || !probe) {
      await it.skip('needs GJS + a display: the phone bar and sheet fit the floor, the pill table matches the widget')
      return
    }

    // Built inside an `it`, so a throw fails one test instead of aborting
    // the run; the assertions below read the same report.
    let phone: PhoneChromeReport | null = null
    await it('builds the phone chrome at the ladder floor and logs what GTK measured', async () => {
      phone = probe.probePhoneChrome()
      const table = phone.parts.map((p) => `${p.name.padEnd(18)} min ${p.min}  nat ${p.nat}  alloc ${p.alloc}`)
      console.log(
        `[phone-chrome] floor ${phone.floorPx} px · sheet min ${phone.sheetMinPx} · sheet alloc ${phone.sheetAllocPx}\n  ${table.join('\n  ')}`,
      )
      expect(phone.parts.length).toBeGreaterThan(5)
    })
    if (!phone) return
    const report: PhoneChromeReport = phone

    await it('asks the window for no more than the ladder floor, sheet closed', async () => {
      expect(report.sheetMinPx).toBeLessThanOrEqual(report.floorPx)
      // Not just the minimum: the allocation at the floor IS the floor.
      expect(report.sheetAllocPx).toBe(report.floorPx)
    })

    await it('keeps every part of the bar and the sheet page within the floor', async () => {
      for (const part of report.parts) expect(part.min).toBeLessThanOrEqual(report.floorPx)
    })

    await it('sizes a recent swatch button to RECENT_BUTTON_PX — CSS and constant agree', async () => {
      expect(report.recent.buttonPx).toBe(RECENT_BUTTON_PX)
    })

    await it('shows a whole number of recent tiles at the floor, none sliced', async () => {
      const strip = report.parts.find((p) => p.name.trim() === 'recent tiles')
      expect(strip).toBeDefined()
      // The "⌃" and its gap come off the strip's allocation; the rest is swatches.
      const expandPx = 44 + 4
      const expected = wholeCount(
        Array.from({ length: RECENT_TILES_MAX }, () => RECENT_BUTTON_PX),
        RECENT_PITCH_PX - RECENT_BUTTON_PX,
        (strip?.alloc ?? 0) - expandPx,
      )
      expect(report.recent.shown).toBe(expected)
      expect(report.recent.shown).toBeGreaterThanOrEqual(6)
      expect(report.recent.allWhole).toBe(true)
    })

    await it('measures both pills within a few px of the tables chrome-stages.ts reasons with', async () => {
      const pills = probe.probePillWidths()
      console.log(
        `[phone-chrome] editing pill natural width per rung: ${CHROME_STAGES.map((s) => `${s} ${pills.editing[s]} (table ${STAGE_EDITING_PILL_PX[s]})`).join(' · ')} · context pill solo ${pills.contextSolo} (table ${CONTEXT_PILL_PX.solo})`,
      )
      for (const stage of CHROME_STAGES) {
        const delta = pills.editing[stage] - STAGE_EDITING_PILL_PX[stage]
        if (TEXT_FREE_STAGES.includes(stage)) {
          expect(Math.abs(delta)).toBeLessThanOrEqual(EXACT_PX)
        } else {
          expect(delta).toBeLessThanOrEqual(TEXT_LOW_PX)
          expect(-delta).toBeLessThanOrEqual(TEXT_HIGH_PX)
        }
      }
      expect(Math.abs(pills.contextSolo - CONTEXT_PILL_PX.solo)).toBeLessThanOrEqual(EXACT_PX)
    })
  })
}
