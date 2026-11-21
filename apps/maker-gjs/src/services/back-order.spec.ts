import { describe, expect, it } from '@gjsify/unit'

import { BACK_STEPS, type BackState, pushedPageFor, resolveBackStep } from './back-order.ts'

/** Nothing to undo: every gesture should fall through. */
const idle: BackState = {
  running: false,
  sidebarOpen: false,
  inMap: false,
  sheetOpen: false,
  hasSelection: false,
  pushedPage: false,
}

const state = (overrides: Partial<BackState>): BackState => ({ ...idle, ...overrides })

export default async () => {
  await describe('back order', async () => {
    await it('undoes nothing on an idle top-level page', async () => {
      expect(resolveBackStep(idle)).toBe('none')
    })

    await it('follows the order REDESIGN.md § 3.4 fixes', async () => {
      expect([...BACK_STEPS]).toStrictEqual([
        'stop-run',
        'close-sidebar',
        'collapse-sheet',
        'clear-selection',
        'pop-page',
        'leave-map',
        'none',
      ])
    })

    await it('stops a Live Run before anything else', async () => {
      // Everything else is true as well: the run still wins.
      const busy = state({ running: true, inMap: true, sheetOpen: true, hasSelection: true, pushedPage: true })
      expect(resolveBackStep(busy)).toBe('stop-run')
    })

    await it('closes the map sidebar overlay before anything underneath', async () => {
      const open = state({ sidebarOpen: true, inMap: true, sheetOpen: true, hasSelection: true, pushedPage: true })
      expect(resolveBackStep(open)).toBe('close-sidebar')
      expect(resolveBackStep(state({ sidebarOpen: true }))).toBe('close-sidebar')
    })

    await it('lets a Live Run beat the sidebar overlay', async () => {
      expect(resolveBackStep(state({ running: true, sidebarOpen: true }))).toBe('stop-run')
    })

    await it('stops a Live Run from any destination', async () => {
      expect(resolveBackStep(state({ running: true }))).toBe('stop-run')
    })

    await it('collapses the sheet before clearing a selection', async () => {
      const open = state({ inMap: true, sheetOpen: true, hasSelection: true })
      expect(resolveBackStep(open)).toBe('collapse-sheet')
    })

    await it('clears a selection before popping a page', async () => {
      const selected = state({ inMap: true, hasSelection: true, pushedPage: true })
      expect(resolveBackStep(selected)).toBe('clear-selection')
    })

    await it('pops a pushed page before leaving the map', async () => {
      expect(resolveBackStep(state({ inMap: true, pushedPage: true }))).toBe('pop-page')
    })

    await it('leaves the map last', async () => {
      expect(resolveBackStep(state({ inMap: true }))).toBe('leave-map')
    })

    await it('pops a pushed Library or Game detail page', async () => {
      expect(resolveBackStep(state({ pushedPage: true }))).toBe('pop-page')
    })

    await it('pops a drilled-in Game section', async () => {
      const game = { library: false, game: true }
      expect(resolveBackStep(state({ pushedPage: pushedPageFor('game', game) }))).toBe('pop-page')
      // Back on the Game list itself belongs to the shell.
      expect(resolveBackStep(state({ pushedPage: pushedPageFor('game', { library: false, game: false }) }))).toBe(
        'none',
      )
    })

    await it('counts only the visible destination\u2019s drill-in', async () => {
      const both = { library: true, game: true }
      expect(pushedPageFor('library', { library: false, game: true })).toBe(false)
      expect(pushedPageFor('game', { library: true, game: false })).toBe(false)
      expect(pushedPageFor('library', both)).toBe(true)
      expect(pushedPageFor('world', both)).toBe(false)
      expect(pushedPageFor('map', both)).toBe(false)
    })

    await it('stops a Live Run before popping a Game section', async () => {
      expect(resolveBackStep(state({ running: true, pushedPage: true }))).toBe('stop-run')
    })

    await it('ignores the editor sheet and selection while the editor is hidden', async () => {
      // `Adw.ViewStack` keeps the map editor page alive across switches
      // (§ 3.4, "tabs keep their place"), so its sheet may still be open
      // and its placement still selected while World is showing. Neither
      // may eat World's back.
      expect(resolveBackStep(state({ sheetOpen: true, hasSelection: true }))).toBe('none')
      expect(resolveBackStep(state({ sheetOpen: true, hasSelection: true, pushedPage: true }))).toBe('pop-page')
    })
  })
}
