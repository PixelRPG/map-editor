import { describe, expect, it } from '@gjsify/unit'

import {
  DOUBLE_CLICK_MS,
  DRAG_THRESHOLD_PX,
  dragModeFor,
  hasPassedDragThreshold,
  isDoubleClick,
} from './scene-card.drag.ts'

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

      await it('does NOT trigger exactly at the threshold (strictly greater)', async () => {
        expect(hasPassedDragThreshold(DRAG_THRESHOLD_PX, 0)).toBe(false)
      })

      await it('triggers one hair past the threshold', async () => {
        expect(hasPassedDragThreshold(DRAG_THRESHOLD_PX + 0.001, 0)).toBe(true)
      })

      await it('ignores the sign of the travel', async () => {
        expect(hasPassedDragThreshold(-5, 0)).toBe(true)
        expect(hasPassedDragThreshold(0, -5)).toBe(true)
      })

      await it('is false for no movement at all', async () => {
        expect(hasPassedDragThreshold(0, 0)).toBe(false)
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

      await it('rejects a click exactly on the window edge (strictly less)', async () => {
        expect(isDoubleClick(1000 + DOUBLE_CLICK_MS, 1000)).toBe(false)
      })

      await it('accepts one millisecond inside the window', async () => {
        expect(isDoubleClick(1000 + DOUBLE_CLICK_MS - 1, 1000)).toBe(true)
      })

      await it('accepts two clicks in the same millisecond', async () => {
        expect(isDoubleClick(1000, 1000)).toBe(true)
      })
    })
  })
}
