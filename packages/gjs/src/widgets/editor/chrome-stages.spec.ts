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

  await describe('stageForCanvasWidth', async () => {
    await it('maps each threshold to its own stage', async () => {
      for (const stage of CHROME_STAGES) {
        expect(stageForCanvasWidth(STAGE_MIN_CANVAS_PX[stage])).toBe(stage)
      }
    })

    await it('stays one stage below its own threshold', async () => {
      expect(stageForCanvasWidth(603)).toBe('tight')
      expect(stageForCanvasWidth(663)).toBe('compact')
      expect(stageForCanvasWidth(783)).toBe('normal-1')
      expect(stageForCanvasWidth(1123)).toBe('normal-2')
    })

    await it('places the real window sizes where the design says', async () => {
      // 1280 collapsed → roomy; 1280 with both sidebars → normal-1;
      // 1024 collapsed → normal-2; a tablet with the inspector → tight.
      expect(stageForCanvasWidth(1280)).toBe('roomy')
      expect(stageForCanvasWidth(732)).toBe('normal-1')
      expect(stageForCanvasWidth(1024)).toBe('normal-2')
      expect(stageForCanvasWidth(468)).toBe('tight')
      expect(stageForCanvasWidth(360)).toBe('tight')
    })
  })
}
