/**
 * The selection bar must come up hidden and follow the selection.
 *
 * `map-caption.spec.ts` proves the wording on paper. This one needs GTK
 * and a display, because the bug it guards against lives in the
 * template binding rather than in any getter: a sync-create `bind` reads
 * `revealed` from inside `super()`, where the class fields are still
 * `undefined`, and an empty bar with a dead "Open" button was the
 * result. Skips (counted as ignored, never as passed) under the node
 * target and on a headless runner — see `pixel-probe.ts` for why the
 * display question is asked once.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { MapSelectionFacts } from './map-summary.model.ts'

/** GJS is the only target with GTK; the node target stubs `gi://` and must never evaluate the widget. */
const isGjs = typeof (globalThis as { imports?: unknown }).imports !== 'undefined'

const FACTS: MapSelectionFacts = { cols: 40, rows: 30, doors: 2, doorsNowhere: 0, things: 3 }

export default async () => {
  await describe('PixelRpgMapSelectionBar — bound state', async () => {
    const rig = isGjs ? await import('./pixel-probe.ts') : null
    const probe = isGjs ? await import('./map-selection-bar.probe.ts') : null
    if (!rig?.hasDisplay() || !probe) {
      await it.skip('needs GJS + a display: the bar is hidden until a map is selected')
      return
    }
    const report = probe.probeSelectionBar('Kokiri Forest', FACTS)

    await it('comes up hidden, with nothing to read and nothing to press', async () => {
      expect(report.fresh.barVisible).toBe(false)
      expect(report.fresh.revealed).toBe(false)
      expect(report.fresh.name).toBe('')
      expect(report.fresh.details).toBe('')
    })

    await it('shows the selected map once one is set', async () => {
      expect(report.withMap.barVisible).toBe(true)
      expect(report.withMap.name).toBe('Kokiri Forest')
      expect(report.withMap.details.length).toBeGreaterThan(0)
    })

    await it('hides again when the selection goes away', async () => {
      expect(report.cleared.barVisible).toBe(false)
      expect(report.cleared.revealed).toBe(false)
    })
  })
}
