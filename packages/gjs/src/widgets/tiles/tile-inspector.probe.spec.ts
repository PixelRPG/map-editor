/**
 * The tile inspector's collision group, measured by GTK instead of by eye.
 *
 * REDESIGN § 10 risk 7: every new phone surface must fit the ladder's
 * floor. An `Adw.ToggleGroup` does not wrap, so the `Adw.WrapBox` around
 * the pictograms cannot save a group that is too wide — only GTK can say
 * whether a group fits, and this asks it. It is what split the ten
 * presets into three groups: as one group they measured 373 px against a
 * 328 px budget. The same run proves the groups and the custom-shape hint
 * actually reach the widget tree, which is not obvious
 * (`Adw.PreferencesGroup` documents `Adw.PreferencesRow` children and
 * silently accepting — or dropping — anything else is its own business),
 * and that the three groups behave as one choice.
 *
 * Needs GTK and a display, so it runs on a workstation and skips
 * (counted as ignored, never as passed) under the node target and on a
 * headless runner — see `../editor/pixel-probe.ts` for why the display
 * question is asked once.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { TileInspectorReport } from './tile-inspector.probe.ts'

/** GJS is the only target with GTK; the node target stubs `gi://` and must never evaluate the widget. */
const isGjs = typeof (globalThis as { imports?: unknown }).imports !== 'undefined'

export default async () => {
  await describe('tile inspector collision group — measured by GTK', async () => {
    const rig = isGjs ? await import('../editor/pixel-probe.ts') : null
    const probe = isGjs ? await import('./tile-inspector.probe.ts') : null
    if (!rig?.hasDisplay() || !probe) {
      await it.skip('needs GJS + a display: the ten pictograms fit the phone inspector')
      return
    }

    // Built inside an `it`, so a throw fails one test instead of
    // aborting the run; the assertions below read the same report.
    let built: TileInspectorReport | null = null
    await it('builds the inspector and logs what GTK measured', async () => {
      built = probe.probeTileInspector()
      console.log(
        `[tile-inspector] inspector min ${built.inspectorMinPx} px · groups min ` +
          `${built.groupMinPx.join('/')} · wrap nat ${built.wrapNatPx} · budget ${probe.PHONE_INSPECTOR_PX} px`,
      )
      expect(built.wrapNatPx).toBeGreaterThan(0)
    })
    if (!built) return
    const report: TileInspectorReport = built

    await it('keeps the groups and the hint in the preferences group', async () => {
      expect(report.togglesRealized).toBe(true)
      expect(report.hintRealized).toBe(true)
    })

    await it('fits every pictogram group into what a 360 px phone leaves', async () => {
      // Per group, because the wrap box can break between groups but a
      // group cannot break inside itself.
      expect(report.groupMinPx[0]).toBeLessThanOrEqual(probe.PHONE_INSPECTOR_PX)
      // Not just the groups: the whole inspector has to fit the same
      // budget, or the pane is allocated past the window edge.
      expect(report.inspectorMinPx).toBeLessThanOrEqual(probe.PHONE_INSPECTOR_PX)
    })

    await it('marks a preset shape and leaves a custom one unmarked', async () => {
      expect(report.presetActiveName).toBe(probe.EXPECTED_PRESET)
      // Three widgets, one answer: the half must not stay lit next to a
      // leftover corner or whole-tile toggle.
      expect(report.litGroupsAfterPreset).toBe(1)
      // A hand-drawn shape must not be shown as the nearest pictogram:
      // nothing is active, and the hint says why.
      expect(report.customActiveName).toBeNull()
      expect(report.customHintVisible).toBe(true)
    })
  })
}
