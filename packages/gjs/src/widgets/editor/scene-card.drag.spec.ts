import { describe, expect, it } from '@gjsify/unit'

import { dragModeFor, hasPassedDragThreshold, isDoubleClick } from './scene-card.drag.ts'

export default async () => {
  await describe('scene-card.drag', async () => {
    await describe('dragModeFor', async () => {
      await it('pans only when the lock is open and the press missed it', async () => {
        expect(dragModeFor(true, false)).toBe('pan')
      })

      await it('moves the card when the preview is not pannable', async () => {
        expect(dragModeFor(false, false)).toBe('move')
      })

      await it('moves the card for a press that landed on the lock', async () => {
        expect(dragModeFor(true, true)).toBe('move')
      })
    })

    await describe('hasPassedDragThreshold', async () => {
      await it('ignores a jitter-sized movement', async () => {
        expect(hasPassedDragThreshold(2, 2)).toBe(false)
      })

      await it('triggers once the press travels far enough', async () => {
        expect(hasPassedDragThreshold(0, 5)).toBe(true)
      })

      await it('measures the diagonal, not either axis', async () => {
        expect(hasPassedDragThreshold(3, 3)).toBe(true)
      })
    })

    await describe('isDoubleClick', async () => {
      await it('accepts a quick second click', async () => {
        expect(isDoubleClick(1000, 800)).toBe(true)
      })

      await it('rejects a slow second click', async () => {
        expect(isDoubleClick(2000, 800)).toBe(false)
      })

      await it('rejects a first click (no previous timestamp)', async () => {
        expect(isDoubleClick(1000, 0)).toBe(false)
      })
    })
  })
}
