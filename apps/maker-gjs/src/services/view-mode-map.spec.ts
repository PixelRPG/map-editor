import { describe, expect, it } from '@gjsify/unit'

import { modeForView, resolveModeNavigation } from './view-mode-map.ts'

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
      expect(resolveModeNavigation('world', true)).toStrictEqual({ kind: 'navigate', view: 'atlas' })
      expect(resolveModeNavigation('cast', true)).toStrictEqual({ kind: 'navigate', view: 'cast' })
      expect(resolveModeNavigation('game', true)).toStrictEqual({ kind: 'navigate', view: 'game' })
    })

    await it('resolves EVERY mode to a view — no mode is advertised without one', async () => {
      // The Audio row was the one exception: it toasted "Coming soon" and
      // snapped the rail back. It is gone, and `check-mode-routes.mjs`
      // fails the build if a mode without a view reappears.
      for (const mode of ['world', 'cast', 'objects', 'tiles', 'game']) {
        expect(resolveModeNavigation(mode, true).kind).toBe('navigate')
      }
    })

    await it('ignores every project-scoped mode without a project', async () => {
      for (const mode of ['world', 'cast', 'objects', 'tiles', 'game']) {
        expect(resolveModeNavigation(mode, false)).toStrictEqual({ kind: 'ignore' })
      }
    })

    await it('ignores an unknown mode id', async () => {
      expect(resolveModeNavigation('nope', true)).toStrictEqual({ kind: 'ignore' })
      expect(resolveModeNavigation('audio', true)).toStrictEqual({ kind: 'ignore' })
    })
  })
}
