import { describe, expect, it } from '@gjsify/unit'

import { modeForView, resolveModeNavigation, routeForView } from './view-mode-map.ts'

export default async () => {
  await describe('routeForView', async () => {
    await it('splits the flat view name into the two stack levels', async () => {
      expect(routeForView('welcome')).toStrictEqual({ root: 'welcome', shell: null })
      expect(routeForView('world')).toStrictEqual({ root: 'shell', shell: 'world' })
      expect(routeForView('library')).toStrictEqual({ root: 'shell', shell: 'library' })
      expect(routeForView('game')).toStrictEqual({ root: 'shell', shell: 'game' })
      expect(routeForView('map')).toStrictEqual({ root: 'map', shell: null })
    })
  })

  await describe('modeForView', async () => {
    await it('maps each shell destination onto its own mode', async () => {
      expect(modeForView('world')).toBe('world')
      expect(modeForView('library')).toBe('library')
      expect(modeForView('game')).toBe('game')
    })

    await it('leaves the views outside the shell without a mode', async () => {
      // `map` keeping the switcher where it was is what lets the map
      // editor's back button return to the page the map was opened from
      // (REDESIGN.md § 3.4).
      expect(modeForView('welcome')).toBe(null)
      expect(modeForView('map')).toBe(null)
    })
  })

  await describe('resolveModeNavigation', async () => {
    await it('navigates to the mode’s view when a project is open', async () => {
      expect(resolveModeNavigation('world', true)).toStrictEqual({ kind: 'navigate', view: 'world' })
      expect(resolveModeNavigation('library', true)).toStrictEqual({ kind: 'navigate', view: 'library' })
      expect(resolveModeNavigation('game', true)).toStrictEqual({ kind: 'navigate', view: 'game' })
    })

    await it('resolves EVERY mode to a view — no mode is advertised without one', async () => {
      // The Audio row was the one exception: it toasted "Coming soon" and
      // snapped the rail back. It is gone, and `check-mode-routes.mjs`
      // fails the build if a mode without a view reappears.
      for (const mode of ['world', 'library', 'game']) {
        expect(resolveModeNavigation(mode, true).kind).toBe('navigate')
      }
    })

    await it('ignores every project-scoped mode without a project', async () => {
      for (const mode of ['world', 'library', 'game']) {
        expect(resolveModeNavigation(mode, false)).toStrictEqual({ kind: 'ignore' })
      }
    })

    await it('ignores an unknown mode id', async () => {
      expect(resolveModeNavigation('nope', true)).toStrictEqual({ kind: 'ignore' })
      expect(resolveModeNavigation('audio', true)).toStrictEqual({ kind: 'ignore' })
    })

    await it('ignores the three rows that merged into the Library', async () => {
      // Cast, Objects and Sheets are chips of one row now; a stale
      // `win.mode` target must not fall through to some other page.
      for (const old of ['cast', 'objects', 'tiles']) {
        expect(resolveModeNavigation(old, true)).toStrictEqual({ kind: 'ignore' })
      }
    })
  })
}
