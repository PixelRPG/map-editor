import { describe, expect, it } from '@gjsify/unit'

import { fallbackModeForView, modeForView, resolveModeNavigation } from './view-mode-map.ts'

export default async () => {
  await describe('modeForView', async () => {
    await it('maps the scene editor onto the world rail row', async () => {
      expect(modeForView('atlas')).toBe('world')
      expect(modeForView('scene-editor')).toBe('world')
    })

    await it('leaves the welcome view without a mode', async () => {
      expect(modeForView('welcome')).toBe(null)
    })
  })

  await describe('resolveModeNavigation', async () => {
    await it('navigates to the mode’s view when a project is open', async () => {
      expect(resolveModeNavigation('world', true, 'welcome')).toStrictEqual({ kind: 'navigate', view: 'atlas' })
      expect(resolveModeNavigation('cast', true, 'atlas')).toStrictEqual({ kind: 'navigate', view: 'cast' })
      expect(resolveModeNavigation('data', true, 'atlas')).toStrictEqual({ kind: 'navigate', view: 'data' })
    })

    await it('ignores every project-scoped mode without a project', async () => {
      for (const mode of ['world', 'cast', 'objects', 'tiles', 'data']) {
        expect(resolveModeNavigation(mode, false, 'welcome')).toStrictEqual({ kind: 'ignore' })
      }
    })

    await it('ignores an unknown mode id', async () => {
      expect(resolveModeNavigation('nope', true, 'atlas')).toStrictEqual({ kind: 'ignore' })
    })

    await it('reports audio as unimplemented regardless of the project state', async () => {
      expect(resolveModeNavigation('audio', false, 'tiles')).toStrictEqual({ kind: 'unimplemented', fallback: 'tiles' })
      expect(resolveModeNavigation('audio', true, 'atlas')).toStrictEqual({ kind: 'unimplemented', fallback: 'world' })
    })
  })

  await describe('fallbackModeForView', async () => {
    await it('keeps the rail on views that own a rail row', async () => {
      expect(fallbackModeForView('cast')).toBe('cast')
      expect(fallbackModeForView('tiles')).toBe('tiles')
      expect(fallbackModeForView('data')).toBe('data')
    })

    await it('falls back to world for every other view', async () => {
      // `objects` and `scene-editor` deliberately land on `world` — the
      // fallback list predates both views and snapping to `world` is the
      // conservative default (see resolveModeNavigation).
      expect(fallbackModeForView('objects')).toBe('world')
      expect(fallbackModeForView('scene-editor')).toBe('world')
      expect(fallbackModeForView(null)).toBe('world')
    })
  })
}
