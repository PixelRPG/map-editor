/**
 * The shortcut reference must never name a key the window does not
 * bind. The dialog builds itself from `SHORTCUT_SECTIONS` and resolves
 * each row through `acceleratorFor`, so a row whose action has no
 * accelerator would silently vanish from the list rather than fail —
 * which is how "Keyboard Shortcuts" shipped greyed out in every build
 * before it was removed. These assertions make that visible instead.
 */

import { describe, expect, it } from '@gjsify/unit'

import { acceleratorFor, SHORTCUT_SECTIONS, WINDOW_ACCELS } from './accels.ts'
import { WINDOW_ACTION_NAMES } from './action-registry.ts'

/** `win.set-tool::pencil` names the action `set-tool`. */
function actionNameOf(detailed: string): string {
  return detailed.replace(/^win\./, '').split('::')[0]
}

export default async () => {
  await describe('WINDOW_ACCELS', async () => {
    await it('binds only actions the window registers', async () => {
      for (const [detailed] of WINDOW_ACCELS) {
        expect(WINDOW_ACTION_NAMES.includes(actionNameOf(detailed))).toBe(true)
      }
    })

    await it('never binds one accelerator to two actions', async () => {
      const seen = new Map<string, string>()
      for (const [detailed, keys] of WINDOW_ACCELS) {
        for (const key of keys) {
          expect(seen.has(key)).toBe(false)
          seen.set(key, detailed)
        }
      }
    })

    await it('gives every tool a key, so an icon-only group is still nameable', async () => {
      for (const tool of ['select', 'pencil', 'fill', 'eraser', 'eyedropper', 'object']) {
        expect(acceleratorFor(`win.set-tool::${tool}`)).not.toBe(null)
      }
    })
  })

  await describe('SHORTCUT_SECTIONS', async () => {
    await it('lists no row the accel table cannot resolve', async () => {
      for (const section of SHORTCUT_SECTIONS) {
        expect(section.items.length).toBeGreaterThan(0)
        for (const item of section.items) {
          expect(acceleratorFor(item.action)).not.toBe(null)
        }
      }
    })

    await it('names an action the window registers on every row', async () => {
      for (const section of SHORTCUT_SECTIONS) {
        for (const item of section.items) {
          expect(WINDOW_ACTION_NAMES.includes(actionNameOf(item.action))).toBe(true)
        }
      }
    })

    await it('has no duplicate row across sections', async () => {
      const rows = SHORTCUT_SECTIONS.flatMap((section) => section.items.map((item) => item.action))
      expect(new Set(rows).size).toBe(rows.length)
    })
  })
}
