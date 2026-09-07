/**
 * The disclosure ladder's rules, without a display.
 *
 * The two invariants at the top are the ones the layout this replaces
 * broke, so they are asserted across the whole cross product rather than
 * at the one width that happened to be looked at.
 */

import { describe, expect, it } from '@gjsify/unit'

import {
  type ChromeLayout,
  type ChromeStage,
  CHROME_STAGES,
  chromeFlags,
  CONTEXT_PILL_PX,
  effectiveStage,
  pillsFit,
  STAGE_EDITING_PILL_PX,
  STAGE_MIN_CANVAS_PX,
  stageForCanvasWidth,
} from './chrome-stages.ts'

const LAYOUTS: readonly ChromeLayout[] = ['wide', 'phone'] as const

/** Every (stage, layout, playing) the chrome can be in. */
function everyState(): Array<{ stage: ChromeStage; layout: ChromeLayout; playing: boolean }> {
  const out = []
  for (const stage of CHROME_STAGES) {
    for (const layout of LAYOUTS) {
      for (const playing of [false, true]) out.push({ stage, layout, playing })
    }
  }
  return out
}

export default async () => {
  await describe('chromeFlags — invariants', async () => {
    await it('offers undo in exactly one place whenever editing is possible', async () => {
      for (const { stage, layout, playing } of everyState()) {
        const f = chromeFlags(stage, layout, playing)
        const editable = !(layout === 'phone' && playing)
        const undos = [f.undoButton, f.phoneUndo].filter(Boolean).length
        expect(undos).toBe(editable ? 1 : 0)
      }
    })

    await it('never hides undo behind the overflow menu', async () => {
      // The bar this replaces put undo inside "⋯" below 460sp, which on
      // a phone made the only undo on touch two taps deep.
      for (const { stage, layout } of everyState()) {
        const f = chromeFlags(stage, layout, false)
        expect(f.undoButton || f.phoneUndo).toBe(true)
      }
    })

    await it('keeps the badge on screen wherever the tool group is dropped', async () => {
      // The badge is never hidden by the ladder, so the armed tool is
      // always nameable — its corner disc carries the tool's icon.
      for (const { stage, layout } of everyState()) {
        const f = chromeFlags(stage, layout, false)
        if (!f.toolGroup) expect(layout === 'wide' && stage === 'tight').toBe(true)
      }
    })

    await it('shows exactly one of the editing pill and the back circle', async () => {
      for (const { stage, layout } of everyState()) {
        const f = chromeFlags(stage, layout, false)
        expect([f.editingPill, f.backCircle].filter(Boolean).length).toBe(1)
      }
    })

    await it('gives the run the whole screen on phone', async () => {
      const f = chromeFlags('tight', 'phone', true)
      expect(f.bottomBar).toBe(false)
      expect(f.playFab).toBe(false)
      expect(f.backCircle).toBe(false)
      expect(f.overflowButton).toBe(false)
      expect(f.runtimeControls).toBe(true)
    })

    await it('leaves the wide layout editable while a run is going', async () => {
      // Paint-while-the-hero-walks is tablet and desktop only: on phone
      // the finger is the joystick.
      const f = chromeFlags('roomy', 'wide', true)
      expect(f.toolGroup).toBe(true)
      expect(f.undoButton).toBe(true)
      expect(f.runtimeControls).toBe(false)
    })
  })

  await describe('chromeFlags — the wide ladder', async () => {
    await it('adds one thing per stage and never takes one away', async () => {
      const rows = CHROME_STAGES.map((stage) => chromeFlags(stage, 'wide', false))
      const keys = ['toolGroup', 'backLabel', 'badgeLabel', 'toolLabels'] as const
      for (const key of keys) {
        let seenTrue = false
        for (const row of rows) {
          if (row[key]) seenTrue = true
          else expect(seenTrue).toBe(false)
        }
        // Every disclosed item does eventually appear.
        expect(seenTrue).toBe(true)
      }
    })

    await it('drops the tool group first and the toggle labels last', async () => {
      expect(chromeFlags('tight', 'wide', false).toolGroup).toBe(false)
      expect(chromeFlags('compact', 'wide', false).toolGroup).toBe(true)
      expect(chromeFlags('compact', 'wide', false).backLabel).toBe(false)
      expect(chromeFlags('normal-1', 'wide', false).backLabel).toBe(true)
      expect(chromeFlags('normal-1', 'wide', false).badgeLabel).toBe(false)
      expect(chromeFlags('normal-2', 'wide', false).badgeLabel).toBe(true)
      expect(chromeFlags('normal-2', 'wide', false).toolLabels).toBe(false)
      expect(chromeFlags('roomy', 'wide', false).toolLabels).toBe(true)
    })

    await it('gives the phone four tools and the desktop six', async () => {
      expect(chromeFlags('tight', 'phone', false).toolsArePhoneSet).toBe(true)
      expect(chromeFlags('roomy', 'wide', false).toolsArePhoneSet).toBe(false)
    })
  })

  await describe('effectiveStage — the fit check', async () => {
    await it('refuses the two rungs that overlapped in the running app', async () => {
      // Measured: a 620 px canvas with a roster (142 px context pill)
      // cannot afford `compact`'s 479 px editing pill, and a 784 px one
      // cannot afford `normal-2`'s 764 px pill.
      expect(effectiveStage('compact', 620, CONTEXT_PILL_PX.withRoster)).toBe('tight')
      expect(effectiveStage('normal-2', 784, CONTEXT_PILL_PX.withRoster)).toBe('normal-1')
      // And a roster of three, which the thresholds do not carry.
      expect(effectiveStage('roomy', 1140, 257)).toBe('normal-2')
    })

    await it('keeps the proposed rung when the pills do fit', async () => {
      expect(effectiveStage('compact', 620, CONTEXT_PILL_PX.solo)).toBe('compact')
      expect(effectiveStage('roomy', 1280, CONTEXT_PILL_PX.withRoster)).toBe('roomy')
      expect(effectiveStage('normal-1', 720, CONTEXT_PILL_PX.withRoster)).toBe('normal-1')
    })

    await it('never proposes a rung whose pills do not fit', async () => {
      for (const stage of CHROME_STAGES) {
        for (const contextPx of [CONTEXT_PILL_PX.solo, CONTEXT_PILL_PX.withRoster, 220]) {
          for (let canvas = 360; canvas <= 1600; canvas += 17) {
            const chosen = effectiveStage(stage, canvas, contextPx)
            if (chosen === 'tight') continue
            expect(pillsFit(STAGE_EDITING_PILL_PX[chosen], contextPx, canvas)).toBe(true)
          }
        }
      }
    })

    await it('falls back to tight rather than to nothing', async () => {
      // A canvas too small even for the tight pill still has to render
      // something; `tight` is the floor, and the pill clips rather than
      // the chrome vanishing.
      expect(effectiveStage('roomy', 200, 300)).toBe('tight')
    })

    await it('never climbs above what the bin proposed', async () => {
      for (const stage of CHROME_STAGES) {
        const chosen = effectiveStage(stage, 4000, CONTEXT_PILL_PX.solo)
        expect(CHROME_STAGES.indexOf(chosen)).toBeLessThan(CHROME_STAGES.indexOf(stage) + 1)
      }
    })
  })

  await describe('STAGE_EDITING_PILL_PX', async () => {
    await it('grows with every rung, because each one only adds', async () => {
      let previous = -1
      for (const stage of CHROME_STAGES) {
        expect(STAGE_EDITING_PILL_PX[stage]).toBeGreaterThan(previous)
        previous = STAGE_EDITING_PILL_PX[stage]
      }
    })

    await it('is affordable at its own breakpoint even with a roster', async () => {
      // The thresholds carry the with-roster case on purpose: the AI
      // assistant is in the session whenever an agent drives the editor,
      // so a solo-width threshold would overlap in the common case.
      for (const stage of CHROME_STAGES) {
        if (stage === 'tight') continue
        expect(pillsFit(STAGE_EDITING_PILL_PX[stage], CONTEXT_PILL_PX.withRoster, STAGE_MIN_CANVAS_PX[stage])).toBe(
          true,
        )
      }
    })
  })

  await describe('stageForCanvasWidth', async () => {
    await it('maps each threshold to its own stage', async () => {
      for (const stage of CHROME_STAGES) {
        expect(stageForCanvasWidth(STAGE_MIN_CANVAS_PX[stage])).toBe(stage)
      }
    })

    await it('stays one stage below its own threshold', async () => {
      expect(stageForCanvasWidth(655)).toBe('tight')
      expect(stageForCanvasWidth(703)).toBe('compact')
      expect(stageForCanvasWidth(855)).toBe('normal-1')
      expect(stageForCanvasWidth(1135)).toBe('normal-2')
    })

    await it('places the measured canvas widths where the app showed them', async () => {
      // Each of these was captured from the running editor and the pill
      // widths read back off the pixels; see the PR body.
      expect(stageForCanvasWidth(1300)).toBe('roomy')
      expect(stageForCanvasWidth(1000)).toBe('normal-2')
      expect(stageForCanvasWidth(780)).toBe('normal-1')
      expect(stageForCanvasWidth(660)).toBe('compact')
      expect(stageForCanvasWidth(464)).toBe('tight')
      expect(stageForCanvasWidth(360)).toBe('tight')
    })
  })
}
